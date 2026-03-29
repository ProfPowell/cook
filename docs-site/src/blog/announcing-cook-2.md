---
title: Announcing Cook 2.0
date: 2026-03-28
description: Cook SSG 2.0 is here — npm distribution, DSD component authoring, LLM-consumable docs, and a documentation site built with Cook itself.
author: Prof. Powell
layout: post
tags: [release, announcement]
---

# Announcing Cook 2.0

Cook SSG 2.0 is the first version available as a proper npm package. Install it with `npm install cook-ssg` and start building with `npx cook build`.

## What's new

### npm distribution

Cook is now published as `cook-ssg` on npm. Install it as a dependency in any project:

<code-block language="bash" label="Terminal">npm install cook-ssg
npx cook build
npx cook dev</code-block>

### DSD component authoring

Cook components can now use **Declarative Shadow DOM** for true encapsulation. Include `<template shadowrootmode="open">` in your component file and Cook renders it as a proper web component at build time — zero JavaScript required for initial paint.

### LLM-ready documentation

Cook now generates `llms.txt` and `llms-full.txt` automatically. Your documentation is instantly consumable by AI coding assistants like Claude, Copilot, and Cursor. Add custom AI instructions via `data.llmsInstructions` in your config.

### This documentation site

You're looking at it. This site is built with Cook and exercises the full [Vanilla Breeze](https://github.com/ProfPowell/vanilla-breeze) component library — layout components, code blocks, heading links, print button, and more.

## Get started

Check out the [Quick Start](/docs/quick-start/) guide to get up and running.
