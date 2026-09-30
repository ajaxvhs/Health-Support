export interface ErrorMetadata {
  code?: string;
  status?: number;
  cause?: unknown;
  outcome?: "partial_failure";
  authUserId?: string;
}

export class AppError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly outcome?: "partial_failure";
  readonly authUserId?: string;

  constructor(message: string, metadata: ErrorMetadata = {}) {
    super(message, metadata.cause === undefined ? undefined : { cause: metadata.cause });
    this.name = "AppError";
    this.code = metadata.code;
    this.status = metadata.status;
    this.outcome = metadata.outcome;
    this.authUserId = metadata.authUserId;
  }
}

const supabaseMessages: Record<string, string> = {
  "23503": "Este item está vinculado a outros registros e não pode ser excluído.",
  "23505": "Já existe um registro com esses dados.",
  "23514": "A operação não pode violar as regras de integridade do portal.",
  "42501": "Você não tem permissão para realizar esta operação.",
  PGRST116: "O registro não foi encontrado ou não está mais disponível.",
  PGRST301: "Sua sessão expirou. Entre novamente.",
  PGRST302: "Sua sessão expirou. Entre novamente.",
};

function errorRecord(reason: unknown): Record<string, unknown> | null {
  return typeof reason === "object" && reason !== null ? (reason as Record<string, unknown>) : null;
}

function metadataOf(reason: unknown): ErrorMetadata {
  const record = errorRecord(reason);
  return {
    code: typeof record?.code === "string" ? record.code : undefined,
    outcome: record?.outcome === "partial_failure" ? "partial_failure" : undefined,
    authUserId: typeof record?.authUserId === "string" ? record.authUserId : undefined,
    status:
      typeof record?.status === "number"
        ? record.status
        : typeof record?.statusCode === "number"
          ? record.statusCode
          : undefined,
  };
}

function isStructuredBackendError(reason: unknown) {
  const record = errorRecord(reason);
  if (!record) return false;
  if (
    typeof record.code === "string" ||
    typeof record.details === "string" ||
    typeof record.hint === "string"
  )
    return true;
  return (
    typeof record.name === "string" &&
    /^(Auth|Postgrest|Functions|Storage|Realtime).*Error$/.test(record.name)
  );
}

export function withErrorContext(reason: unknown, message: string): AppError {
  if (reason instanceof AppError) {
    return new AppError(message, {
      code: reason.code,
      status: reason.status,
      cause: reason,
      outcome: reason.outcome,
      authUserId: reason.authUserId,
    });
  }

  const metadata = metadataOf(reason);
  const safeMessage =
    reason instanceof Error && !isStructuredBackendError(reason) ? reason.message : message;
  return new AppError(safeMessage || message, { ...metadata, cause: reason });
}

export function normalizeError(reason: unknown, fallback: string): AppError {
  if (reason instanceof AppError) {
    if (reason.message) return reason;
    const mappedMessage = reason.code ? supabaseMessages[reason.code] : undefined;
    return new AppError(mappedMessage ?? fallback, {
      code: reason.code,
      status: reason.status,
      cause: reason.cause ?? reason,
      outcome: reason.outcome,
      authUserId: reason.authUserId,
    });
  }

  const metadata = metadataOf(reason);
  const mappedMessage = metadata.code ? supabaseMessages[metadata.code] : undefined;
  const message = mappedMessage
    ? mappedMessage
    : isStructuredBackendError(reason)
      ? fallback
      : reason instanceof Error
        ? reason.message || fallback
        : fallback;

  return new AppError(message, { ...metadata, cause: reason });
}
