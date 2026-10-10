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
        person: { select: { id: true, name: true } },
      },
    });
  }
}
