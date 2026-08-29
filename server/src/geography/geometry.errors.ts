/**
 * Safe domain errors for geography and geometry operations.
 *
 * Messages are sanitized and stable. They must never leak raw SQL,
 * PostGIS notices, coordinate arrays, connection strings, credentials, or internal stacks.
 */

export type GeometryErrorCode =
  'INVALID_GEOMETRY' | 'REFERENCE_NOT_FOUND' | 'PERSISTENCE_FAILED';

export class GeometryError extends Error {
  readonly code: GeometryErrorCode;

  constructor(code: GeometryErrorCode, message: string) {
    super(message);
    this.name = 'GeometryError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static invalid(
    message = 'Geometry input is invalid or unsupported.',
  ): GeometryError {
    return new GeometryError('INVALID_GEOMETRY', message);
  }

  static referenceNotFound(
    message = 'Referenced region or region source does not exist.',
  ): GeometryError {
    return new GeometryError('REFERENCE_NOT_FOUND', message);
  }

  static persistenceFailed(
    message = 'Failed to persist geometry record.',
  ): GeometryError {
    return new GeometryError('PERSISTENCE_FAILED', message);
  }
}
