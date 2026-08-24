import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AcresEnv } from './env.validation';

/**
 * A typed read of the validated environment. Nothing outside this file touches
 * `process.env`, so every consumer gets the boot-time-validated value.
 */
@Injectable()
export class AcresConfigService {
  constructor(private readonly config: ConfigService<AcresEnv, true>) {}

  private get<K extends keyof AcresEnv>(key: K): AcresEnv[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): AcresEnv['nodeEnv'] {
    return this.get('nodeEnv');
  }

  get isProduction(): boolean {
    return this.get('isProduction');
  }

  get port(): number {
    return this.get('port');
  }

  get clientOrigin(): string {
    return this.get('clientOrigin');
  }

  get databaseUrl(): string {
    return this.get('databaseUrl');
  }

  get sessionCookieName(): string {
    return this.get('sessionCookieName');
  }

  get sessionTtlDays(): number {
    return this.get('sessionTtlDays');
  }

  get sessionSecret(): string {
    return this.get('sessionSecret');
  }

  get csrfCookieName(): string {
    return this.get('csrfCookieName');
  }

  get schedulerEnabled(): boolean {
    return this.get('schedulerEnabled');
  }

  get rateLimitTtlMs(): number {
    return this.get('rateLimitTtlMs');
  }

  get rateLimitDefaultLimit(): number {
    return this.get('rateLimitDefaultLimit');
  }

  get rateLimitStrictLimit(): number {
    return this.get('rateLimitStrictLimit');
  }

  get tenancyEnabled(): boolean {
    return this.get('tenancyEnabled');
  }

  get invitationTtlHours(): number {
    return this.get('invitationTtlHours');
  }

  get accountTokenTtlMinutes(): number {
    return this.get('accountTokenTtlMinutes');
  }

  get graphqlMaxBytes(): number {
    return this.get('graphqlMaxBytes');
  }

  get graphqlMaxDepth(): number {
    return this.get('graphqlMaxDepth');
  }

  get graphqlMaxAliases(): number {
    return this.get('graphqlMaxAliases');
  }

  get graphqlMaxCost(): number {
    return this.get('graphqlMaxCost');
  }

  get graphqlMaxFirst(): number {
    return this.get('graphqlMaxFirst');
  }

  get graphqlMaxNodes(): number {
    return this.get('graphqlMaxNodes');
  }

  get graphqlTimeoutMs(): number {
    return this.get('graphqlTimeoutMs');
  }

  get idempotencyTtlHours(): number {
    return this.get('idempotencyTtlHours');
  }

  get valkeyUrl(): string {
    return this.get('valkeyUrl');
  }

  get queueName(): string {
    return this.get('queueName');
  }

  get queuePrefix(): string {
    return this.get('queuePrefix');
  }

  get queueDefaultAttempts(): number {
    return this.get('queueDefaultAttempts');
  }

  get queueBackoffMs(): number {
    return this.get('queueBackoffMs');
  }

  get queueShutdownMs(): number {
    return this.get('queueShutdownMs');
  }

  get storageEndpoint(): string {
    return this.get('storageEndpoint');
  }

  get storageRegion(): string {
    return this.get('storageRegion');
  }

  get storageBucket(): string {
    return this.get('storageBucket');
  }

  get storageAccessKeyId(): string {
    return this.get('storageAccessKeyId');
  }

  get storageSecretAccessKey(): string {
    return this.get('storageSecretAccessKey');
  }

  get storageForcePathStyle(): boolean {
    return this.get('storageForcePathStyle');
  }

  get presignedUploadTtlSeconds(): number {
    return this.get('presignedUploadTtlSeconds');
  }

  get acceptedDownloadTtlSeconds(): number {
    return this.get('acceptedDownloadTtlSeconds');
  }

  get clamavHost(): string {
    return this.get('clamavHost');
  }

  get clamavPort(): number {
    return this.get('clamavPort');
  }

  get clamavScanTimeoutMs(): number {
    return this.get('clamavScanTimeoutMs');
  }

  get uploadMaxBytes(): number {
    return this.get('uploadMaxBytes');
  }

  get uploadAcceptedMediaTypes(): string[] {
    return this.get('uploadAcceptedMediaTypes');
  }

  get uploadStaleMinutes(): number {
    return this.get('uploadStaleMinutes');
  }

  get uploadCleanupIntervalMs(): number {
    return this.get('uploadCleanupIntervalMs');
  }

  get outboxClaimBatchSize(): number {
    return this.get('outboxClaimBatchSize');
  }

  get outboxClaimLeaseMs(): number {
    return this.get('outboxClaimLeaseMs');
  }

  get outboxMaxAttempts(): number {
    return this.get('outboxMaxAttempts');
  }
}
