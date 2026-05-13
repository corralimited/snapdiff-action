# Publishing this action

Source lives at `packages/snapdiff-action/` in the SnapDiff monorepo. It's
published to `github.com/corralimited/snapdiff-action` as a standalone
GitHub Action so customers can reference it via
`uses: corralimited/snapdiff-action@v1`.

## One-time setup

```bash
# 1. Create the public repo
gh repo create corralimited/snapdiff-action --public \
  --description "Visual regression tests with SnapDiff"

# 2. Initialize it from this directory
cd packages/snapdiff-action
git init
git add action.yml README.md LICENSE runtime/ examples/
git commit -m "Initial release"
git branch -M main
git remote add origin https://github.com/corralimited/snapdiff-action.git
git push -u origin main

# 3. Tag the initial release
git tag v1.0.0
git tag -f v1         # Major version alias — users reference @v1
git push origin v1.0.0
git push origin v1 --force

# 4. Create a GitHub Release for discoverability
gh release create v1.0.0 \
  --title "SnapDiff Visual Test Action v1.0.0" \
  --notes "Initial release."

# 5. Submit to GitHub Marketplace (optional)
#    https://github.com/marketplace/actions — follow the "publish from repo" flow
```

## Subsequent releases

After updating `action.yml` or `runtime/`, sync the changes to the
standalone repo (see [Sync](#sync) below), then in that repo:

```bash
git tag v1.1.0
git tag -f v1         # Move the floating major tag
git push origin v1.1.0
git push origin v1 --force
```

Users pinning `@v1` get the new version automatically. Users pinning
`@v1.0.0` stay locked.

## Versioning

- Reference `@v1` in docs and examples (floating major tag).
- Breaking changes bump to `v2`. Old `v1` users unaffected.
- Never delete a published tag.

### What counts as breaking

- Removing or renaming an input
- Changing an input default in a way that changes capture output (e.g.
  flipping `full-page` from `false` to `true` — every page re-diffs)
- Removing an output field
- Bumping the Playwright major version (rendering can shift sub-pixel)

### What doesn't

- Adding an optional input with a non-rendering default
- Adding an output
- Internal refactors that don't change the contract or rendering

## Sync

Two ways to push monorepo changes to the standalone repo.

**Subtree split** (cleaner history once the action is stable):

```bash
git subtree split --prefix=packages/snapdiff-action -b snapdiff-action-split
git push git@github.com:corralimited/snapdiff-action.git snapdiff-action-split:main
git branch -D snapdiff-action-split
```

**rsync** (fine while iterating):

```bash
rsync -a --delete packages/snapdiff-action/ ../corralimited-snapdiff-action/
cd ../corralimited-snapdiff-action
git add . && git commit -m "Sync from monorepo"
```

Wire whichever you pick into a release script so it's not a hand operation.
