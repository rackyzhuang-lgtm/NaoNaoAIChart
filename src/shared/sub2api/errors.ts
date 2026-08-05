export type Sub2ApiErrorCode = number | string

export class Sub2ApiError extends Error {
  constructor(
    message: string,
    public readonly code: Sub2ApiErrorCode,
    public readonly status?: number,
    public readonly reason?: string
  ) {
    super(message)
    this.name = 'Sub2ApiError'
  }
}

export class Sub2ApiContractError extends Sub2ApiError {
  constructor(message = 'sub2api returned an unexpected response') {
    super(message, 'INVALID_RESPONSE')
    this.name = 'Sub2ApiContractError'
  }
}
