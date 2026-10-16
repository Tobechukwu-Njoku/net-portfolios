# Net-Portfolios

A dark, glassmorphism photography portfolio: six galleries with their own layouts, a slide-out
About panel, a lightbox, and a contact form that emails you through Gmail. Photos are resized
to WebP on the fly and cached.

One container serves one portfolio. Everything personal (name, slogan, bio, location, social
links, gallery names, contact address) is set with environment variables, and photos come from
a folder, so the same image works for anyone. Run a second container for a second person.

```
ghcr.io/tobechukwu-njoku/net-portfolios:latest     (linux/amd64, linux/arm64)
```

## Quick start

```bash
docker run -d --name portfolio -p 8080:8080 \
  -v /path/to/photos:/photos \
  -e SITE_NAME="Ada Lovelace" \
  -e SITE_SLOGAN="Light, patience and a little luck" \
  -e ABOUT_CITY="London" -e ABOUT_COUNTRY="England" \
  -e SOCIAL_INSTAGRAM="https://instagram.com/your-handle" \
  ghcr.io/tobechukwu-njoku/net-portfolios:latest
```

Open http://localhost:8080. Until you add photos, every gallery shows stand-in images marked
"Placeholder".

**Unraid:** download the template from the Unraid terminal, then Docker → Add Container →
Template: *Net-Portfolios*. Every setting below appears as a field.

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/my-Net-Portfolios.xml \
  https://raw.githubusercontent.com/Tobechukwu-Njoku/net-portfolios/main/unraid/Net-Portfolios.xml
```

**Docker Compose:** see [`docker-compose.yml`](docker-compose.yml), which runs two portfolios
side by side.

## Photos

Mount a folder at `/photos` with one subfolder per gallery, plus `about/` for your profile photo:

```
photos/
  about/me.jpg
  featured/  01-heron.jpg  02-coast--full.jpg
  fauna/     ...
  people/
  landscape/
  urban/     07-tower--isolate.jpg
  film/      03-roll--feature.jpg
```

- Photos are shown in file-name order, so number them (`01-`, `02-`, …).
- A gallery with photos shows only those; an empty one shows placeholders, or is hidden when
  `SHOW_PLACEHOLDERS=false`.
- Add a layout flag to the file name, before the extension:
  - `--full` (Featured): spans the full width as a visual break
  - `--isolate` (Urban): set apart on its own with breathing room
  - `--feature` (Film): singled out with extra negative space
- JPEG, PNG and WebP are resized and cached in `/app/.cache` (mount it to keep the cache across
  updates). Metadata, including GPS, is stripped from what visitors download.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `SITE_NAME` | `[Your Name]` | Header, About panel, page title, email sender name |
| `SITE_SLOGAN` | *(empty)* | Line under the name; hidden when empty |
| `ABOUT_BIO` | placeholder text | Biography in the About panel |
| `ABOUT_CITY`, `ABOUT_COUNTRY` | *(empty)* | Shown as "City, Country" |
| `ABOUT_LOCATION` | *(empty)* | Free-text location; replaces city + country |
| `ABOUT_PHOTO` | first image in `about/` | Profile photo, as a path inside `/photos` |
| `SOCIAL_INSTAGRAM`, `SOCIAL_X`, `SOCIAL_FACEBOOK`, `SOCIAL_LINKEDIN`, `SOCIAL_BEHANCE`, `SOCIAL_FLICKR`, `SOCIAL_YOUTUBE` | *(empty)* | Full `https://` URLs; each one set adds an icon |
| `SOCIAL_EMAIL` | *(empty)* | An address shown as an email icon |
| `GALLERIES` | `featured,fauna,people,landscape,urban,film` | Which galleries to show, in order |
| `GALLERY_<ID>_TITLE` | per gallery | Rename a gallery, e.g. `GALLERY_FAUNA_TITLE=Wildlife` |
| `GALLERY_<ID>_TAGLINE` | per gallery | The quote under a gallery's title |
| `SHOW_PLACEHOLDERS` | `true` | `false` hides galleries that have no photos yet |
| `MARK_PLACEHOLDERS` | `true` | Small "Placeholder" tag on stand-in photos |
| `CONTACT_TO` | *(empty)* | Where contact-form messages go |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | *(empty)* | The Gmail account that sends them (see below) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `smtp.gmail.com`, `465`, `true` | Use another mail server instead of Gmail |
| `TRUST_PROXY` | `false` | Set `true` behind Traefik, Pangolin, nginx or Caddy so rate limiting sees visitors' real addresses |
| `PORT` | `8080` | Port inside the container |

Gallery IDs are `featured`, `fauna`, `people`, `landscape`, `urban` and `film`; each has its
own layout.

## Contact form

The form needs three settings: `CONTACT_TO`, `GMAIL_USER` and `GMAIL_APP_PASSWORD`. Until all
three are set, it tells visitors messages can't be sent right now, and the log says why.

`GMAIL_APP_PASSWORD` is not your Gmail password. On the sending Google account, turn on
2-Step Verification, then create one under Google Account → Security → App passwords. Messages
arrive as normal emails; replying answers the visitor directly. Each visitor can send at most 5
messages per 15 minutes.

## Full control: your own content.js

For captions or a hand-picked photo order, mount a folder at `/config` containing a
`content.js`; it replaces everything generated from the settings. The easiest start is the
file the server generates for you:

```bash
curl http://localhost:8080/content.js > config/content.js
```

Photos in it are listed per gallery, for example
`{ src: 'images/urban/tower.jpg', w: 3, h: 4, alt: 'Clock tower', isolate: true, caption: 'Big Ben, 2024' }`
(`images/` maps to `/photos`; `w` and `h` only need the right proportions).

## Behind a reverse proxy

Point the proxy at the container's port 8080 and set `TRUST_PROXY=true`. The site needs no
special paths or headers.

## Run it without Docker

Node 20 or newer:

```bash
npm ci
cp .env.example .env      # fill it in
node server.js            # photos are read from ./photos
```

## Updating

Pull the new image and recreate the container (on Unraid: *Check for Updates*, then
*Apply update*). Your photos and settings live outside the image.

## Development

`index.html`, `style.css` and `app.js` are the page and its six layouts; `server.js` builds the
content from the settings, serves and resizes photos, and handles the contact form;
`mailer.js` sends mail with no extra packages; `defaults.json` holds each gallery's default
title, tagline and placeholder photos. Pushes to `main` build and publish the image with
GitHub Actions (`.github/workflows/docker.yml`).

## Licence

[MIT](LICENSE)
