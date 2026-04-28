package repo

import "github.com/lib/pq"

var errConflictStub = &pq.Error{Code: "23505"}
