import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async logEvent(
    tx: any,
    actorId: string | null,
    actorRole: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    patientId: string | null,
    metadata: any = null,
  ) {
    try {
      await tx.auditEvent.create({
        data: {
          actor_user_id: actorId,
          actor_role: actorRole,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          patient_id: patientId,
          metadata: metadata || undefined,
        },
      });
    } catch (e) {
      const error = e as Error;
      this.logger.error(`Failed to write audit event ${action}: ${error.message}`);
      throw error; // Audit failure must fail the sensitive operation
    }
  }
}
