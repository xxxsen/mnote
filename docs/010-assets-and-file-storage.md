# 资产、文件存储与媒体预览

## 1. 功能范围

文件系统为编辑器粘贴、Markdown 资源、附件下载和 `/assets` 资产页面提供统一字节存储。数据库中的
资产记录负责用户范围、展示信息、上传状态和文档引用；实际字节由本地文件系统或 S3 兼容对象存储
保存。

系统支持：

- JWT 保护的文件上传；
- 公开的原始附件读取；
- PDF、Video、Audio 的统一应用层预览流；
- 图片缩略图和详情预览；
- 资产搜索、分页、详情及引用文档；
- Local/S3 上传失败后的状态补偿和孤儿清理。

文件读取路由沿用公开 URL 模型。知道文件 Key 的访问者可以读取文件；该能力不继承文档权限，也
不能被解释为私有附件授权。若未来改为私有文件，必须同时设计编辑器、媒体 Range、公开分享和短期
凭据，不能把 JWT 放进媒体 URL 查询参数。

## 2. 数据与上传状态

资产记录包含用户标识、文件 Key、兼容 URL、原文件名、MIME、大小、时间和上传状态。同一用户与
文件 Key 唯一。

上传状态为 `pending | ready | failed`：

1. 在读取文件前执行配置的大小限制。
2. 从实际内容探测 MIME，不信任客户端声明。
3. 生成带用户范围和随机部分的单段文件 Key。
4. 建立 `pending` 资产记录。
5. 写入当前 Store。
6. 原子转换为 `ready`；失败时转换为 `failed` 并尝试删除对象。
7. 仅向业务列表和引用关系暴露 `ready` 资产。

上传中断不得被报告为成功。对象写入、状态转换或补偿删除失败时保留稳定状态和结构化日志，以便
后台清理继续收敛。

`AssetCleanupWorker` 定期领取超时的 `pending/failed` 记录。数据库租约避免多实例重复处理；
Worker 先删除对象，再删除仍非 ready 的记录。对象删除失败时保存稳定错误并释放租约，ready 资产
永不进入该清理路径。

## 3. 文件 Key 与 Store 契约

### 3.1 文件 Key

所有 Store 输入和公开文件路由只接受单个 ASCII 段：

```text
[A-Za-z0-9._-]+
```

空值、`.`、`..`、斜线、反斜线、空白、控制字符和完整 URL 都被拒绝。S3 的 Bucket、prefix 和
Endpoint 仅来自服务端配置，不能从请求或 `asset.url` 反向推导。

### 3.2 Store 接口

Store 提供完整对象和范围读取：

```go
type ObjectInfo struct {
    Size int64
}

type ByteRange struct {
    Start int64 // inclusive
    End   int64 // inclusive
}

type ReadableStore interface {
    Open(ctx context.Context, key string) (io.ReadCloser, error)
    Stat(ctx context.Context, key string) (ObjectInfo, error)
    OpenRange(ctx context.Context, key string, value ByteRange) (io.ReadCloser, error)
}

type Store interface {
    ReadableStore
    Save(ctx context.Context, key string, r ReadSeekCloser, size int64) error
    Delete(ctx context.Context, key string) error
    GenerateFileRef(userID, filename string) (string, error)
    PublicURL(key string) string
}
```

Provider 使用可由 `errors.Is` 识别的 `ErrInvalidFileKey` 和 `ErrObjectNotFound`。Handler 将它们映射
为 400 和 404；其他 Provider 错误只写结构化日志并映射为 500，不能向客户端暴露磁盘路径、
Bucket、prefix、凭据或 SDK 内部信息。

### 3.3 Local

Local Store 把 Key 映射到配置目录。`Stat` 和 `Open` 只接受普通文件；不存在的文件统一映射为
`ErrObjectNotFound`。`OpenRange` 使用 `io.SectionReader`，返回的 ReadCloser 必须关闭底层
`*os.File`。

### 3.4 S3

S3 Store 只接收安全 Key，然后在 Provider 内部附加 prefix：

- `Stat` 使用 `HeadObject`；
- `Open` 使用无 Range 的 `GetObject`；
- `OpenRange` 精确传递 `Range: bytes={start}-{end}`；
- `NoSuchKey`、`NotFound` 和等价 404 错误归一为 `ErrObjectNotFound`；
- 调用者必须关闭成功返回的 Body。

`PublicURL` 只负责兼容 URL 输出，不能作为 Store 输入。历史对象不依赖 S3 metadata 判定预览
MIME，因此无需回填或复制。

## 4. HTTP 文件接口

### 4.1 原始文件

```text
GET /api/v1/files/{key}
```

该路由公开并由应用从当前 Store 流式读取。图片、Video、Audio 保持 inline；其他内容使用
attachment。PDF 必须使用 attachment，并设置：

```http
X-Content-Type-Options: nosniff
Content-Security-Policy: sandbox; default-src 'none'; object-src 'none'; frame-ancestors 'none'
Cache-Control: private, no-transform
```

Assets 页的 URL 展示、Copy URL、Copy Markdown 和 Open 都从 `file_key` 生成此应用 URL。即使
资产记录的兼容 URL 指向 S3，也不能把该 S3 URL用于 PDF 打开、复制或预览。

### 4.2 媒体预览

```text
HEAD /api/v1/files/{key}/preview
GET  /api/v1/files/{key}/preview
```

预览路由同样公开，但只允许实际内容为 PDF、Video 或 Audio。接口不接受远程 URL、MIME 覆盖参数
或认证查询参数。

成功响应的共同头：

```http
Content-Type: <detected media type>
Content-Length: <full or selected range length>
Content-Disposition: <attachment-or-inline>; filename="<validated-key>"
Accept-Ranges: bytes
X-Content-Type-Options: nosniff
Cache-Control: private, no-transform
```

PDF 使用 `attachment` 并额外返回严格 CSP；Video/Audio 使用 `inline`。文件名只使用已校验的
ASCII Key，不拼接用户原始文件名。

HEAD 忽略请求中的 Range，返回完整对象元数据和 200，不打开完整 Body。

### 4.3 Range

GET 支持一个 `bytes` Range：

- `bytes=0-499`
- `bytes=500-`
- `bytes=-500`

没有 Range 时返回 200。合法范围返回 206，并包含
`Content-Range: bytes {start}-{end}/{size}`。超出末尾的 end 截断到 `size-1`。

多段 Range、错误单位、空范围、非十进制符号、反向范围、start 越界和空文件范围返回 416，并
包含 `Content-Range: bytes */{size}`。不实现 multipart/byteranges。

应用以 int64 计算范围并流式复制；不得 `io.ReadAll` 完整对象。客户端取消、读取失败或写出失败时
立即停止复制并关闭 Body。响应已经开始后不能改写状态码，只记录 request ID、Key、已写字节和错误
类别。

文件流必须绕过全局 gzip 中间件。压缩会删除或改写 Content-Length，并破坏 PDF.js 与媒体控件
依赖的原始字节范围；`/api/v1/files/` 因此是明确的压缩排除路径。

### 4.4 MIME 与状态码

预览接口按以下顺序识别实际内容：

1. `Stat` 获取对象大小；空对象返回 415。
2. 读取开头最多 512 字节并调用 `http.DetectContentType`。
3. 非通用二进制结果直接规范化使用。
4. 通用二进制只允许按已支持的 Video/Audio 扩展回退；`.pdf` 禁止回退。
5. `application/ogg` 仅在 `.ogv` 时规范为 `video/ogg`，在 `.ogg/.oga` 时规范为
   `audio/ogg`。
6. 只放行 `application/pdf`、`video/*` 和 `audio/*`。

HTML、SVG、文本、ZIP、Office 文件或伪装成 `.pdf` 的内容返回 415，不能进入 PDF.js 或 inline
渲染。PDF 实际大小大于 25 MiB 时，HEAD、完整 GET 和 Range GET 都返回 413，并且只能执行头部
探测，不能打开完整 Body；25 MiB 整允许预览。

状态码：

| 状态 | 含义 |
|---|---|
| 200 | HEAD 或完整 GET |
| 206 | 合法单段 Range |
| 400 | 非法 Key |
| 404 | 对象不存在 |
| 413 | PDF 超过 25 MiB |
| 415 | 内容不属于预览白名单 |
| 416 | Range 非法或不可满足 |
| 500 | Stat、头部读取或 Open 的内部 Provider 错误 |

文件响应不使用 JSON envelope。CORS 允许 HEAD，并暴露
`Accept-Ranges, Content-Length, Content-Range, Content-Type`。

## 5. 文档资产关系

每次被接受的文档保存都会从正文提取资源 URL，找到当前用户拥有的资产，并在文档保存事务中替换
`document_assets` 关系。关系用于 Assets 页展示引用文档，不决定文件字节权限。

修改文件 URL 格式时，必须同步核对上传响应、编辑器渲染、资源提取、资产 Open/Copy 和历史
`asset.url` 兼容。图片预览暂时仍可使用 `asset.url`；PDF、Video、Audio 预览及所有主动复制/打开
操作必须使用由 `file_key` 生成的应用 URL。

## 6. Assets 页面

`/assets` 使用响应式主从布局：

- `>=768px` 同时展示左侧列表和右侧详情；
- 列表和详情分别使用独立纵向滚动容器并阻止滚动链传播；
- 长列表滚动不能带走右侧预览；
- 窄视口一次只显示一个面板，选择资产进入详情，Back to Assets 返回列表；
- 从 320px 起不得产生 body 横向溢出。

搜索使用短防抖，并结合 `q`、`limit`、`offset` 分页。搜索、追加加载和引用查询都有
AbortController 与请求序号；旧请求不能覆盖新选择。初次失败、追加失败、空数据、搜索无结果和
引用失败分别提供稳定状态及恢复动作。

列表保持轻量：

- 图片显示已有缩略图；
- PDF、Video、Audio 只显示类型图标和完整文件名；
- 列表项不创建 Canvas、PDF Worker、Video、Audio，也不发送预览 HEAD/GET。

详情始终保留 Preview、Details、Open/Copy 和 References。预览失败不能隐藏其余功能。

## 7. 前端媒体预览

### 7.1 类型和 URL

`classifyAssetPreview(contentType, filename)` 先规范 MIME，再按
`pdf | video | audio | image | unsupported` 分类。只有空 MIME 或
`application/octet-stream` 才允许扩展回退；明确但不支持的 MIME 不能被文件名覆盖。

预览和下载 URL 分别为：

```text
{API_BASE}/files/{encoded-file-key}/preview
{API_BASE}/files/{encoded-file-key}
```

客户端重复执行与后端一致的安全单段 Key 校验。Key 缺失或非法时，媒体降级为 unsupported，
Open/Copy 禁用，不能回退到任意 `asset.url`。

### 7.2 检查与竞态

成为当前选中项的 PDF、Video、Audio 先发送可取消的 HEAD，使用
`credentials: "omit"`。响应必须是 2xx、MIME 与预期类型一致，并具有非负整数 Content-Length。
PDF 客户端同时检查 25 MiB 上限。

404、413、415、网络错误和无效响应映射为稳定错误类别，不显示响应正文。切换资产会 abort 旧
HEAD，递增 request ID，并丢弃所有过期 resolve/reject。Retry 重新执行同一检查。Image 和
unsupported 不发送 HEAD。

### 7.3 PDF

PDF 使用精确版本 `pdfjs-dist@5.6.205`，加载包内 legacy display bundle、同源 legacy Worker
以及同版本的压缩 CMap。`predev` 和 `prebuild` 会把依赖包中的 CMap 复制到
`public/pdfjs/cmaps/`，运行时通过同源 `/pdfjs/cmaps/` 按需读取；该生成目录不提交到 Git。
legacy bundle 仅用于兼容缺少新 Map 方法的受支持浏览器，Worker、解析器、CMap 和安全配置仍来自
同一固定版本；禁止 CDN 和运行时浮动版本。CMap 是没有内嵌 ToUnicode 映射的 CJK 字体正常渲染
所必需的运行时数据，升级 `pdfjs-dist` 时必须重新生成，不能与 PDF.js 版本分叉。

页面不使用浏览器原生 PDF Viewer，也不创建 `iframe`、`object`、`embed`、Blob URL、
Annotation/Text/Form layer 或可点击 PDF 内容。PDF.js 只解析预览 URL，并把当前页绘制到一个
Canvas：

- `withCredentials: false`
- `isEvalSupported: false`
- `enableXfa: false`
- `stopAtErrors: true`
- `cMapUrl: /pdfjs/cmaps/`、`cMapPacked: true`
- `annotationMode: DISABLE`
- 64 KiB Range chunk
- `maxImageSize: 16_000_000`
- `canvasMaxAreaInBytes: 64_000_000`

应用不调用 JavaScript、Action、附件、表单、文本层或 Annotation layer API。恶意 PDF 中的脚本、
URI、Launch action 和批注不会产生 DOM、对话框、新窗口或外部请求。

资源上限：

- PDF 字节数不超过 25 MiB；
- 页数不超过 500；
- 用户缩放为 50%–200%，步长 25%；
- DPR 最大为 2；
- Canvas 像素面积不超过 16,000,000；
- Canvas 像素及 CSS 展示区域任一边不超过 8192，展示区域面积也不超过 16,000,000。

任一时刻最多保留一个 PDFDocument、PDFPage、RenderTask 和 Canvas。翻页、缩放、切换、Retry
和卸载按顺序取消旧 RenderTask、清理页面并清空 Canvas；切换、Retry 和卸载还销毁 loading task
或 document。加载和渲染都使用 generation，旧结果不能提交到新资产。

加密 PDF 不收集密码；损坏、缺失、超页、渲染失败和取消分别进入稳定降级或被静默丢弃。Open file
始终指向 attachment 下载 URL。

### 7.4 Video 与 Audio

Video 使用：

```html
<video controls playsinline preload="metadata">
```

Audio 使用：

```html
<audio controls preload="metadata">
```

两者不设置 autoplay、loop 或默认 muted。Audio 同时显示类型图标和文件名。浏览器负责播放、暂停、
进度和音量；系统不承诺转码或不受支持 codec 的播放能力。

切换或卸载时先 pause，移除 src，再调用 load，让浏览器终止旧媒体读取。metadata 失败进入稳定
错误，保留 Retry 和 Open file。

## 8. 安全边界

资产字节是不可信输入。维护实现时必须保持：

- Key 只能访问当前 Store 中的单段对象，不能成为任意 URL 代理或 SSRF 入口；
- PDF 原始接口和预览接口都使用 attachment、nosniff、严格 CSP 和 private/no-transform；
- PDF 只允许 Fetch/Range + Worker 解析 + Canvas 绘制，不能导航或嵌入同源 PDF 文档；
- 实际头部优先于扩展名，`.pdf` 不允许通用二进制回退；
- PDF.js 版本固定、Worker 本地同源、表达式/XFA/Annotation 禁用；
- 服务端不解析 PDF，不对不可信文档执行服务端转换；
- 字节、页数、Canvas、缩放和 Range 都有硬上限；
- 服务端流式读取并响应取消，Body 在所有退出路径关闭；
- 错误文案和日志不包含文件内容、磁盘路径、Bucket、prefix 或凭据；
- 正常 Range 不写高频 INFO 业务日志；
- Video/Audio 只交给原生媒体元素，不注入 HTML、不自动播放、不创建远程 track/source。

严格 CSP 是 direct navigation 和误嵌入时的纵深防御，不替代 attachment 与 Canvas-only 隔离。
浏览器内置 PDF Viewer 对 PDF 响应 CSP 的行为不一致，因此不能改回 iframe 或依赖浏览器 Viewer。

当前公开文件路由没有应用内按字节限速。若出现带宽滥用，应在网关按连接数和每秒字节限速，并重新
验证 PDF.js Range 与媒体拖动；不能直接把按请求间隔工作的通用限流中间件挂到预览路由。

## 9. 发布与维护

后端预览接口必须先于使用它的前端发布。新后端兼容旧前端；新前端访问旧后端只会得到 404，不能
反向发布。

以下变化必须同步更新实现、测试和本文档：

- Store 接口、Key 规则或 Provider 错误映射；
- 预览 MIME 白名单、Range 或响应头；
- PDF.js 版本、bundle/Worker 路径或加载参数；
- PDF 字节、页数、Canvas、缩放上限；
- 公开/私有文件权限模型；
- `asset.url`、下载 URL 或文档资源提取规则；
- 文件流压缩、CORS、网关缓存或 Range 配置。

升级 PDF.js 时必须先复核 Node/浏览器兼容性，再验证普通、带脚本/URI、加密、损坏、超页和超大
PDF。不得通过 CDN 自动升级。

## 10. 验证要点

- Local/S3 Stat、完整读取、精确 Range、NotFound、非法 Key 和 Body 关闭行为一致。
- HEAD、完整 GET、closed/open/suffix Range 和 416 响应符合契约，且文件流未被 gzip 改写。
- PDF 25 MiB 边界、伪装内容和各类不支持 MIME 均 fail closed。
- PDF 下载与预览都是 attachment；媒体预览才是 inline。
- PDF DOM 只有应用工具栏和 Canvas；脚本、URI、批注和附件不产生可执行或可点击内容。
- 加密、损坏、超页、超大、404、415、网络失败和媒体解码失败都有稳定降级与 Retry/Open。
- 列表不加载未选媒体；选择后 HEAD 先于 GET/单段 Range。
- 快速切换和卸载会取消旧检查、PDF 任务和媒体读取，最终只显示最后选择。
- Video/Audio 具有 controls 和 metadata preload，且不自动播放。
- S3 资产的 Open/Copy/PDF.js 不直接使用 S3 PublicURL。
- 长列表滚动不移动右侧详情；移动端返回、键盘操作和窄屏横向溢出保持正确。
