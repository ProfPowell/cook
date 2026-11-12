# Vanilla Breeze starter for Cook

Five layouts (format 1), three includes, a sample `config/data.js` and a few sample pages. Every file passes `cook check-layouts`, so Vanilla Press can open and edit them.

## Use it

Copy this folder, then:

```bash
npm install
npm run dev      # vendors Vanilla Breeze, then serves with live reload
npm run build    # production build into dist/
npm run check    # cook check-layouts
```

`npm run vendor` copies Vanilla Breeze from `node_modules` into `src/assets/vendor/vanilla-breeze/` (git-ignored); the layouts link it from there.

## Layouts

| Layout | Page layout | Offers |
|---|---|---|
| `base` (abstract) | from `pageLayout` | head, header and footer includes, `nav`, `aside` and `head` slots (each section only when its slot is filled) |
| `page` | `stack` | title and content |
| `post` | `article` | title, date, author, tags, featured image (`image`, `imageAlt`), `og:` meta, `aside` slot |
| `docs` | `sidebar-left` | `nav` slot ("Section menu") |
| `landing` | `landing` | `hero` and `cta` slots |

The `post` layout accepts exactly the front matter Vanilla Press writes: `title`, `description`, `date`, `published`, `updated`, `author`, `tags`, `image`, `imageAlt`, `theme`, `themeScope`, `layout`, `slug`, `vp_id`.

Edit `config/data.js` for the site title, tagline and navigation. See the Cook docs, "Layout Format", for the vocabulary.
