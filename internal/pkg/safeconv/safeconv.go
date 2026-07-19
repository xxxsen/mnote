package safeconv

import "math"

func Uint64ToInt(v uint64) int {
	if v > math.MaxInt {
		return math.MaxInt
	}
	return int(v)
}

func Uint32ToInt(v uint32) int {
	return int(v)
}

func UintToInt(v uint) int {
	if v > math.MaxInt {
		return math.MaxInt
	}
	return int(v)
}

func IntToUint(v int) uint {
	if v <= 0 {
		return 0
	}
	return uint(v)
}
