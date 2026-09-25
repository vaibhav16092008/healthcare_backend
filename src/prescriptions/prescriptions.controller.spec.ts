import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionsController } from './prescriptions.controller.js';
import { PrescriptionsService } from './prescriptions.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { vi } from 'vitest';

describe('PrescriptionsController', () => {
  let controller: PrescriptionsController;
  let service: PrescriptionsService;

  beforeEach(async () => {
    const mockService = {
      createPrescription: vi.fn(),
      getPrescriptionsForEncounter: vi.fn(),
      getPrescriptionById: vi.fn(),
      updatePrescription: vi.fn(),
      setPrescriptionStatus: vi.fn(),
      createPrescriptionItem: vi.fn(),
      updatePrescriptionItem: vi.fn(),
      getPrescriptionItems: vi.fn(),
      getPrescriptionItemById: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrescriptionsController],
      providers: [
        { provide: PrescriptionsService, useValue: mockService },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PrescriptionsController>(PrescriptionsController);
    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  const mockUser = (id: string, role: string) => ({
    app_user_id: id,
    app_role: role,
  });

  describe('createPrescription', () => {
    it('calls service createPrescription', async () => {
      const dto = { notes: 'take care' };
      await controller.createPrescription(mockUser('doc-1', 'DOCTOR'), 'e-1', dto);
      expect(service.createPrescription).toHaveBeenCalledWith('doc-1', 'e-1', dto);
    });
  });

  describe('completePrescription', () => {
    it('calls service setPrescriptionStatus', async () => {
      await controller.completePrescription(mockUser('doc-1', 'DOCTOR'), 'pr-1');
      expect(service.setPrescriptionStatus).toHaveBeenCalledWith('doc-1', 'pr-1', 'COMPLETED');
    });
  });
});
