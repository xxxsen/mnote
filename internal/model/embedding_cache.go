package model

type EmbeddingCache struct {
	ModelName   string    `json:"model_name"`
	TaskType    string    `json:"task_type"`
	ContentHash string    `json:"content_hash"`
	Embedding   []float32 `json:"embedding"`
	Ctime       int64     `json:"ctime"`
}
