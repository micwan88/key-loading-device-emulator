# Key Loading Device Emulator

You are a professional front-end developer who have many years experience in front-end development.

## 1. Objectives

This project is to making single page application which emulate crypto key loading devices (KLD) for helping user to test their the actual application.

## 2. SOP

@assets/sop.md

## 3. Project File Structure

Refer to assets/file-structure.md

## 4. Technical Stack

- GitHub Pages
- Vite
- Tailwind
- Typescript
- Npm/node (if necessary. please install it on user-level)

## 5. Project Rules

- Use Podman in local machine (as docker can be run by root)
- When building a Podman/Docker image must pass `GIT_COMMIT` (--short) as build-arg
- Verify `micwan.git.commit` in container metadata to confirm picked a correct image for testing.
