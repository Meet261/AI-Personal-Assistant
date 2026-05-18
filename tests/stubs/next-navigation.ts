export function useParams<T extends Record<string, string>>() {
  return { id: 'test' } as unknown as T
}

export function useRouter() {
  return {
    push() {},
    replace() {},
    back() {},
    forward() {},
    refresh() {},
    prefetch() {},
  }
}

