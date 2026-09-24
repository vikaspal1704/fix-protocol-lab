export type FixParseErrorCode =
  | "BAD_BEGIN_STRING" // missing/incorrect 8= or wrong position
  | "BAD_BODY_LENGTH" // 9 missing, non-numeric, or mismatch
  | "BAD_CHECKSUM" // 10 missing, not 3 digits, or mismatch
  | "MALFORMED_FIELD" // no '=', empty value, non-numeric/leading-zero tag
  | "MISSING_MSG_TYPE" // 35 missing or not third
  | "MISSING_REQUIRED_TAG" // requireField / header validation
  | "MESSAGE_TOO_LARGE" // framer limit exceeded
  | "UNKNOWN_VERSION"; // BeginString / version id not registered (or only planned)

export class FixParseError extends Error {
  readonly code: FixParseErrorCode;
  readonly tag: number | undefined;

  constructor(code: FixParseErrorCode, message: string, tag?: number) {
    super(message);
    this.name = "FixParseError";
    this.code = code;
    this.tag = tag;
  }
}
