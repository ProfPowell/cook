---
title: Image Optimization
description: Automatic responsive image optimization with AVIF/WebP at multiple widths
section: Advanced
---

# Image Optimization

Cook automatically optimizes raster images during the build. Every `&lt;img&gt;` tag referencing a local JPG, PNG, or WebP file is rewritten to a `&lt;picture&gt;` element with AVIF and WebP sources at multiple responsive widths.

## How it works

The image pipeline runs in two phases:

1. **Generate** -- Cook scans `dist/` for raster images (`.jpg`, `.jpeg`, `.png`, `.webp`) and creates responsive derivatives using sharp. Each image gets AVIF and WebP versions at every configured width that does not exceed the original dimensions (no upscaling).

2. **Rewrite** -- Cook finds `&lt;img&gt;` tags in HTML pages, looks up each image in the generated manifest, and replaces the tag with a `&lt;picture&gt;` element containing `&lt;source&gt;` sets for modern formats and a fallback `&lt;img&gt;` with `srcset`, `sizes`, `width`, `height`, and `loading="lazy"`.

## Before and after

Given this source image tag:

<code-block language="html" label="Input">&lt;img src="/assets/img/hero.jpg" alt="Hero image"&gt;</code-block>

Cook produces:

<code-block language="html" label="Output">&lt;picture&gt;
  &lt;source type="image/avif"
    srcset="/assets/img/hero-320w.avif 320w,
           /assets/img/hero-640w.avif 640w,
           /assets/img/hero-960w.avif 960w,
           /assets/img/hero-1280w.avif 1280w,
           /assets/img/hero-1920w.avif 1920w"
    sizes="(min-width: 60rem) 960px, 100vw"&gt;
  &lt;source type="image/webp"
    srcset="/assets/img/hero-320w.webp 320w,
           /assets/img/hero-640w.webp 640w,
           /assets/img/hero-960w.webp 960w,
           /assets/img/hero-1280w.webp 1280w,
           /assets/img/hero-1920w.webp 1920w"
    sizes="(min-width: 60rem) 960px, 100vw"&gt;
  &lt;img src="/assets/img/hero-960w.jpg" alt="Hero image"
    srcset="/assets/img/hero-320w.jpg 320w, ..."
    sizes="(min-width: 60rem) 960px, 100vw"
    width="1920" height="1080" loading="lazy"&gt;
&lt;/picture&gt;</code-block>

## Opting out per image

Add `data-no-optimize` to skip a specific image:

<code-block language="html" label="Skip optimization">&lt;img src="/assets/img/logo.png" alt="Logo" data-no-optimize&gt;</code-block>

SVGs, GIFs, data URIs, and external URLs are always skipped automatically.

## Caching

Cook uses a content-hash disk cache (default: `.cache/images/`) to avoid regenerating unchanged images. On subsequent builds, only new or modified images are processed. The cache stores an MD5 hash of each source file and verifies that all derivative files still exist on disk.

## Configuration

<code-block language="javascript" label="config/main.js">export default {
  images: {
    enabled: true,
    widths: [320, 640, 960, 1280, 1920],
    formats: ['avif', 'webp'],
    quality: { avif: 60, webp: 75, jpeg: 80, png: 80 },
    sizes: '(min-width: 60rem) 960px, 100vw',
    loading: 'lazy',
    cache: '.cache/images',
  },
};</code-block>

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Enable image optimization |
| `widths` | `[320, 640, 960, 1280, 1920]` | Responsive widths to generate |
| `formats` | `['avif', 'webp']` | Modern formats to produce (in addition to original) |
| `quality` | `{ avif: 60, webp: 75, jpeg: 80, png: 80 }` | Quality per format (1-100) |
| `sizes` | `'(min-width: 60rem) 960px, 100vw'` | Default `sizes` attribute |
| `loading` | `'lazy'` | Default `loading` attribute |
| `cache` | `'.cache/images'` | Disk cache directory for generated derivatives |
