import { Test, TestingModule } from '@nestjs/testing';
import { TreatmentPlansController } from './treatment-plans.controller.js';
import { TreatmentPlansService } from './treatment-plans.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { vi } from 'vitest';

describe('TreatmentPlansController', () => {
  let controller: TreatmentPlansController;
  let service: TreatmentPlansService;

  beforeEach(async () => {
    const mockService = {
      createPlan: vi.fn(),
      getPlan: vi.fn(),
      updatePlan: vi.fn(),
      setPlanStatus: vi.fn(),
      createInstruction: vi.fn(),
      getInstructions: vi.fn(),
      getInstructionById: vi.fn(),
      updateInstruction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TreatmentPlansController],
      providers: [
        { provide: TreatmentPlansService, useValue: mockService },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TreatmentPlansController>(TreatmentPlansController);
    service = module.get<TreatmentPlansService>(TreatmentPlansService);
  });

  const mockUser = (id: string, role: string) => ({
    app_user_id: id,
    app_role: role,
  });

  describe('createPlan', () => {
    it('calls service createPlan', async () => {
      const dto = { title: 'Diet Plan' };
      await controller.createPlan(mockUser('doc-1', 'DOCTOR'), 'e-1', dto);
      expect(service.createPlan).toHaveBeenCalledWith('doc-1', 'e-1', dto);
    });
  });

  describe('completePlan', () => {
    it('calls service setPlanStatus', async () => {
      await controller.completePlan(mockUser('doc-1', 'DOCTOR'), 'e-1');
      expect(service.setPlanStatus).toHaveBeenCalledWith('doc-1', 'e-1', 'COMPLETED');
    });
  });
});
