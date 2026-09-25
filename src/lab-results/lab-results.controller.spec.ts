import { Test, TestingModule } from '@nestjs/testing';
import { LabResultsController } from './lab-results.controller.js';
import { LabResultsService } from './lab-results.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { vi } from 'vitest';

describe('LabResultsController', () => {
  let controller: LabResultsController;
  let service: LabResultsService;

  beforeEach(async () => {
    const mockService = {
      createLabResult: vi.fn(),
      getLabResultsForOrder: vi.fn(),
      getLabResultById: vi.fn(),
      finalizeLabResult: vi.fn(),
      amendLabResult: vi.fn(),
      cancelLabResult: vi.fn(),
      createLabResultItem: vi.fn(),
      updateLabResultItem: vi.fn(),
      getLabResultItems: vi.fn(),
      getLabResultItemById: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabResultsController],
      providers: [
        { provide: LabResultsService, useValue: mockService },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LabResultsController>(LabResultsController);
    service = module.get<LabResultsService>(LabResultsService);
  });

  const mockUser = (id: string, role: string) => ({
    app_user_id: id,
    app_role: role,
  });

  describe('createLabResult', () => {
    it('calls service createLabResult', async () => {
      const dto = { report_notes: 'fasting required' };
      await controller.createLabResult(mockUser('doc-1', 'DOCTOR'), 'lo-1', dto);
      expect(service.createLabResult).toHaveBeenCalledWith('doc-1', 'lo-1', dto);
    });
  });

  describe('finalizeLabResult', () => {
    it('calls service finalizeLabResult', async () => {
      await controller.finalizeLabResult(mockUser('doc-1', 'DOCTOR'), 'lr-1');
      expect(service.finalizeLabResult).toHaveBeenCalledWith('doc-1', 'lr-1');
    });
  });
});
