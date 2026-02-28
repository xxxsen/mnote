package service

import (
	"reflect"
	"testing"
)

func TestExtractLinkIDs(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    []string
	}{
		{
			name:    "no links",
			content: "just some text without links",
			want:    nil,
		},
		{
			name:    "one valid link",
			content: "check out [this doc](/docs/123-abc_456)",
			want:    []string{"123-abc_456"},
		},
		{
			name:    "multiple valid links",
			content: "links: [doc1](/docs/ID-1) and [doc2](/docs/ID-2)",
			want:    []string{"ID-1", "ID-2"},
		},
		{
			name:    "html link format",
			content: `<a href="/docs/html-id">link</a>`,
			want:    []string{"html-id"},
		},
		{
			name:    "mixed formats",
			content: "markdown [l1](/docs/m_1) and html <a href='/docs/h_2'>l2</a>",
			want:    []string{"m_1", "h_2"},
		},
		{
			name:    "invalid paths ignored",
			content: "[external](https://google.com) and [other](/other/ID)",
			want:    nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractLinkIDs(tt.content)
			if len(got) == 0 && len(tt.want) == 0 {
				return // both nil or empty is fine
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("extractLinkIDs() = %v, want %v", got, tt.want)
			}
		})
	}
}
