import lodash from "lodash";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: `${process.env.DATABASE_URL}`,
  }),
});

const raw = await prisma.raw.findFirst({ orderBy: { createdAt: "desc" } });
const headers = raw?.json as HeadersInit;

type Paginate<T extends object> = {
  users: T[];
  big_list: boolean;
  page_size: number;
  next_max_id: string;
  has_more: boolean;
  should_limit_list_of_followers: boolean;
  use_clickable_see_more: boolean;
  show_spam_follow_request_tab: boolean;
  follow_ranking_token: string;
  status: string;
};

type Model = Prisma.ExceptionModel;

class Automation {
  private max: number = 300;
  private retry: number = 0;
  private payloads: unknown = {};

  private can(): boolean {
    this.retry++;
    return this.retry < this.max;
  }

  private reset(): void {
    this.retry = 1;
  }

  private async delay(): Promise<void> {
    const min = 10;
    const max = 20;

    return new Promise<void>((resolve) => {
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      console.log("delay:", delay);
      setTimeout(resolve, delay * 1000);
    });
  }

  private async fetcher({
    endpoint,
    max_id,
  }: {
    endpoint: "followers" | "following";
    max_id?: string;
  }): Promise<Model[]> {
    const id = `${process.env.USER_ID}`;
    const url = new URL(
      `https://www.instagram.com/api/v1/friendships/${id}/${endpoint}`,
    );
    url.searchParams.set("count", "25");
    url.searchParams.set("search_surface", "follow_list_page");
    if (max_id) {
      url.searchParams.set("max_id", `${max_id}`);
    }

    try {
      const response = await fetch(url.toString(), {
        method: "get",
        headers,
      });

      if (!response.ok) {
        throw await response.text();
      }

      const result: Paginate<Model> = await response.json();

      console.log(`Done fetching followers url ${url.toString()}...`);

      this.reset();
      await this.delay();

      return [
        ...result.users,
        ...(result.has_more
          ? await this.fetcher({ endpoint, max_id: result.next_max_id })
          : []),
      ];
    } catch (error) {
      const isEqual = lodash.isEqual(
        Object.fromEntries(url.searchParams),
        this.payloads,
      );

      if (isEqual && !this.can()) {
        console.log("Max attempt reached, same payload, can't retry");
        return [];
      }

      this.payloads = Object.fromEntries(url.searchParams);

      console.log(`error attempt ${this.retry}`);

      await this.delay();

      return await this.fetcher({ endpoint, max_id });
    }
  }

  private async unfollow(user: Model, k: number): Promise<void> {
    try {
      const body = new URLSearchParams();
      body.set("doc_id", `${process.env.DOC_ID}`);
      body.set(
        "variables",
        JSON.stringify({
          target_user_id: user.id,
          container_module: "profile",
        }),
      );
      const response = await fetch("https://www.instagram.com/graphql/query", {
        method: "post",
        headers,
        body,
      });

      if (!response.ok) {
        throw await response.text();
      }

      console.log(`Unfollowed ${user.username}`);

      this.reset();
      return await this.delay();
    } catch (error) {
      console.log(this, error);

      const isEqual = lodash.isEqual(
        { target_user_id: user.id },
        this.payloads,
      );

      if (isEqual && !this.can()) {
        console.log("Max attempt reached, same payload, can't retry");
        return await this.delay();
      }

      this.payloads = { target_user_id: user.id };

      console.log(`error attempt ${this.retry}`);

      await this.delay();

      return await this.unfollow(user, k);
    }
  }

  public async execute(): Promise<void> {
    const dc = `https://discord.com/api/webhooks/${process.env.DISCORD_WEBHOOK_ID}/${process.env.DISCORD_TOKEN}`;
    const followers = await this.fetcher({ endpoint: "followers" });
    const following = await this.fetcher({ endpoint: "following" });
    const notFollowBack = following.filter(
      ({ id: xId }) => !followers.some(({ id: yId }) => yId === xId),
    );

    await fetch(dc, {
      method: "post",
      body: (() => {
        const body = new FormData();
        body.append(
          "payload_json",
          JSON.stringify({
            embeds: [
              {
                title: "Not Follow Back",
                description: notFollowBack
                  .map(({ username }) => username)
                  .join(", "),
                color: 16776960,
              },
            ],
          }),
        );

        return body;
      })(),
    });

    const exception = await prisma.exception.findMany({ select: { id: true } });
    const target = notFollowBack.filter(
      (user) => !exception.some((exc) => exc.id === user.id),
    );

    for (const [k, user] of target.entries()) {
      await this.unfollow(user, k);
    }

    await fetch(dc, {
      method: "post",
      body: (() => {
        const body = new FormData();
        body.append(
          "payload_json",
          JSON.stringify({
            embeds: [
              {
                title: "Unfollow Done",
                description: target.map(({ username }) => username).join(", "),
                color: 255,
              },
            ],
          }),
        );

        return body;
      })(),
    });
  }
}

await new Automation().execute();

process.exit(0);
