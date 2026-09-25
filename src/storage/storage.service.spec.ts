import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service.js';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { vi } from 'vitest';

describe('StorageService', () => {
  let service: StorageService;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn(),
    };
  });

  it('fails closed in production if missing credentials (throws on construct)', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      return undefined;
    });

    expect(() => new StorageService(mockConfigService)).toThrow('FATAL');
  });

  it('returns mock urls in development if missing credentials', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });

    const s = new StorageService(mockConfigService);
    const uploadUrl = await s.createSignedUploadUrl('test.pdf');
    expect(uploadUrl).toContain('mock-storage.local');
  });

  it('mock verifyObjectExists returns true if file added to mockUploadedFiles', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });

    const s = new StorageService(mockConfigService);
    s.mockUploadedFiles.add('some/path/file.pdf');

    expect(await s.verifyObjectExists('some/path/file.pdf')).toBe(true);
  });

  it('mock verifyObjectExists returns false if file not added', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });

    const s = new StorageService(mockConfigService);
    expect(await s.verifyObjectExists('missing/file.pdf')).toBe(false);
  });
});
