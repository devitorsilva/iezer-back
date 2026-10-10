import type { ChurchListItem } from "@prisma/client";
import type { RequestContext } from "../../../lib/access.js";
import type { ChurchListRepository } from "./repository.js";

function mapItem(item: ChurchListItem) {
  return { id: item.id, type: item.type, name: item.name, sortOrder: item.sortOrder };
}

export class ChurchListService {
  constructor(private readonly repository: ChurchListRepository) {}

  async list(context: RequestContext) {
    const items = await this.repository.findActive(context.churchId);
    return items.map(mapItem);
  }
}
