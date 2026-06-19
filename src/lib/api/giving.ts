import { ApiResource } from "./client.ts";
import type { Gift, GivingResponse } from "../types.ts";

/** /giving* — shared record of gifts the team gave to an org (hand-entered
 * "giving data", distinct from the 990 grant graph). */
export class GivingApi extends ApiResource {
  list(ein: string) {
    return this.get<GivingResponse>("/giving", { ein });
  }
  add(body: {
    ein: string;
    amount: number;
    fiscal_year?: number;
    gift_date?: string;
    purpose?: string;
  }) {
    return this.post<Gift>("/giving", body);
  }
  remove(giftId: number) {
    return this.post<{ gift_id: number; removed: boolean }>("/giving/delete", {
      gift_id: giftId,
    });
  }
}
