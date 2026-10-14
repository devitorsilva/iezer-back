import { prisma } from "../../lib/prisma.js";

export class MeRepository {
  findUser(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        status: true,
        twoFactorEnabled: true,
        termsVersion: true,
        // O header mostra "Como prefere ser chamado" quando há (RF-MC01).
        person: { select: { id: true, name: true, preferredName: true } },
      },
    });
  }
}
