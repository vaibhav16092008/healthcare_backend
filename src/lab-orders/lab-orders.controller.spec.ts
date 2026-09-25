import { Test, TestingModule } from '@nestjs/testing';
import { LabOrdersController } from './lab-orders.controller.js';
import { LabOrdersService } from './lab-orders.service.js';
import { SupabaseAuthGuard } from '../auth/supabase.guard.js';
import { RolesGuard } from '../auth/roles/roles.guard.js';
import { vi } from 'vitest';

describe('LabOrdersController', () => {
  let controller: LabOrdersController;
  let service: LabOrdersService;

  beforeEach(async () => {
    const mockService = {
      createLabOrder: vi.fn(),
      getLabOrdersForEncounter: vi.fn(),
      getLabOrderById: vi.fn(),
      updateLabOrder: vi.fn(),
      setLabOrderStatus: vi.fn(),
      createLabOrderItem: vi.fn(),
      updateLabOrderItem: vi.fn(),
      getLabOrderItems: vi.fn(),
      getLabOrderItemById: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabOrdersController],
      providers: [
        { provide: LabOrdersService, useValue: mockService },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LabOrdersController>(LabOrdersController);
    service = module.get<LabOrdersService>(LabOrdersService);
  });

  const mockUser = (id: string, role: string) => ({
    app_user_id: id,
    app_role: role,
  });

  describe('createLabOrder', () => {
    it('calls service createLabOrder', async () => {
      const dto = { clinical_notes: 'fasting required' };
      await controller.createLabOrder(mockUser('doc-1', 'DOCTOR'), 'e-1', dto);
      expect(service.createLabOrder).toHaveBeenCalledWith('doc-1', 'e-1', dto);
    });
  });

  describe('completeLabOrder', () => {
    it('calls service setLabOrderStatus', async () => {
      await controller.completeLabOrder(mockUser('doc-1', 'DOCTOR'), 'lo-1');
      expect(service.setLabOrderStatus).toHaveBeenCalledWith('doc-1', 'lo-1', 'COMPLETED');
    });
  });
});
