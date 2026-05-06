# who-didnt

Instagram automation tool that identifies and unfollows users who don't follow you back.

## Features

- Fetches your Instagram followers and following lists
- Identifies users who don't follow you back
- Sends Discord notifications with the list
- Automatically unfollows non-followers (with exception list support)
- Built-in retry logic and rate limiting
- Random delays between requests to avoid detection

## Prerequisites

- [Bun](https://bun.sh) runtime
- PostgreSQL database
- Instagram account credentials
- Discord webhook (for notifications)

## Setup

1. Install dependencies:

```bash
bun install
```

2. Set up your PostgreSQL database and configure Prisma

3. Create a `.env` file with the following variables:

```env
DATABASE_URL=your_postgresql_connection_string
USER_ID=your_instagram_user_id
DOC_ID=instagram_graphql_doc_id
DISCORD_WEBHOOK_ID=your_discord_webhook_id
DISCORD_TOKEN=your_discord_webhook_token
```

4. Add Instagram request headers to the database:

```ts
await prisma.raw.create({
  data: {
    json: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua": '"Google Chrome";v="147", "Chromium";v="147"',
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-csrftoken": "your_csrf_token",
      "x-ig-app-id": "936619743392459",
      "x-ig-www-claim": "your_www_claim",
      "x-requested-with": "XMLHttpRequest",
      Cookie: Object.entries({
        csrftoken: "your_csrf_token",
        sessionid: "your_session_id",
        ds_user_id: "your_ds_user_id",
      })
        .map(([k, v]) => `${k}=${v}`)
        .join(";"),
    },
  },
});
```

> **Note**: You need to extract these headers from your browser's Instagram session. Use browser DevTools Network tab to capture a request to Instagram API.

## Usage

Run the script:

```bash
bun run main.ts
```

The script will:

1. Fetch all your followers and following
2. Compare the lists to find non-followers
3. Send a Discord notification with the list
4. Unfollow users who don't follow you back (except those in the exception list)
5. Send a final Discord notification when done

## Exception List

To prevent unfollowing specific users, add them to the `exception` table in your database with their Instagram user ID.

## ⚠️ Warning

This tool automates Instagram interactions which may violate Instagram's Terms of Service. Use at your own risk. Instagram may:

- Rate limit your account
- Temporarily restrict your actions
- Permanently ban your account

The script includes random delays (10-20 seconds) between requests and retry logic to minimize detection risk, but there are no guarantees.

## Configuration

- `max`: Maximum retry attempts (default: 10)
- Random delay range: 10-20 seconds between requests
- Batch size: 25 users per API request

## License

Private use only.
