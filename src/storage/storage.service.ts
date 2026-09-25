import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class StorageService {
  private supabase: SupabaseClient | null = null;
  private readonly BUCKET_NAME = 'medical-records';
  private readonly logger = new Logger(StorageService.name);

  // For testing in development without real Supabase
  public readonly mockUploadedFiles = new Set<string>();

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    } else {
      if (nodeEnv === 'production') {
        throw new Error('FATAL: SUPABASE_SERVICE_ROLE_KEY is missing in production. Storage Service cannot start safely.');
      }
      this.logger.warn('Supabase credentials not found. Running in mock storage mode (TEST/DEV only).');
    }
  }

  async createSignedUploadUrl(path: string): Promise<string> {
    if (!this.supabase) {
      if (this.configService.get('NODE_ENV') === 'production') {
         throw new InternalServerErrorException('Storage unconfigured in production');
      }
      return `https://mock-storage.local/upload/${path}?token=mock-token`;
    }

    const { data, error } = await this.supabase.storage
      .from(this.BUCKET_NAME)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new InternalServerErrorException('Failed to generate upload URL');
    }
    return data.signedUrl;
  }

  async createSignedDownloadUrl(path: string, expiresInSeconds = 300): Promise<string> {
    if (!this.supabase) {
      if (this.configService.get('NODE_ENV') === 'production') {
         throw new InternalServerErrorException('Storage unconfigured in production');
      }
      return `https://mock-storage.local/download/${path}?token=mock-token&expires=${expiresInSeconds}`;
    }

    const { data, error } = await this.supabase.storage
      .from(this.BUCKET_NAME)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data) {
      throw new InternalServerErrorException('Failed to generate download URL');
    }
    return data.signedUrl;
  }

  async verifyObjectExists(path: string): Promise<boolean> {
    if (!this.supabase) {
      if (this.configService.get('NODE_ENV') === 'production') {
         throw new InternalServerErrorException('Storage unconfigured in production');
      }
      return this.mockUploadedFiles.has(path);
    }

    const folderPath = path.substring(0, path.lastIndexOf('/'));
    const fileName = path.substring(path.lastIndexOf('/') + 1);

    const { data, error } = await this.supabase.storage
      .from(this.BUCKET_NAME)
      .list(folderPath, {
        search: fileName,
        limit: 1,
      });

    if (error) {
      this.logger.error(`Failed to verify object existence: ${error.message}`);
      return false; // Fail closed
    }

    return data && data.length > 0 && data[0].name === fileName;
  }
}
