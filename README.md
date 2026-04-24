# a thousand stories

Run the site locally with:

```bash
npm install
ADMIN_PASSWORD=your_secure_password npm start
```

The app starts on [http://localhost:3000](http://localhost:3000).

Notes:

- Set `ADMIN_PASSWORD` in your environment or in Vercel project settings before using the admin area.
- Local development stores stories in `data/stories.json`.
- Production on Vercel should use Vercel Blob via `BLOB_READ_WRITE_TOKEN` for persistent stories and uploads.
- Uploaded photos fall back to `public/uploads/` in local development.
- The site includes attribution required by the downloaded font/icon assets from [OnlineWebFonts](http://www.onlinewebfonts.com).
