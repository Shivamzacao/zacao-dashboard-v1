# ADR-001: F1 frontend tooling

Status: Accepted

Date: 2026-08-07

## Problem

F1 must implement the locked Tailwind design-token stack and provide focused component,
browser, accessibility, responsive, and visual-regression checks. The repository contained the
approved framework and Vitest, but not the approved frontend build and test packages.

## Options

1. Add the packages already fixed by the locked architecture.
2. Hand-author all styling without Tailwind and use ad hoc DOM checks.
3. Introduce another component or browser-test framework.

## Decision

Use exact versions of the approved packages: Tailwind CSS and its PostCSS plugin for compilation,
Testing Library and user-event for component behavior, jsdom for focused DOM tests, Playwright for
browser/viewport/visual checks, and axe-core with its Playwright adapter for automated accessibility.
No component library or alternate state/data framework is introduced.

## Cost, security, and rollback

All additions are build/test dependencies except Tailwind's build-time packages. They add no
runtime service, data access, browser credential, or business logic. The lockfile is authoritative.
Rollback is removal of these packages and their isolated configuration if the locked architecture
changes before production.
