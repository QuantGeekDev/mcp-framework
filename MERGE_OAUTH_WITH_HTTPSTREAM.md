# Merge Guide: OAuth + HTTP-Stream

## Current Situation

- **Local**: OAuth 2.1 implementation
- **Remote**: HTTP-stream transport + other updates
- **Goal**: Merge both features together

## Step-by-Step Merge Process

### 1. Commit Your Local Changes

```bash
cd /home/user/Documents/mcp-framework
git add -A
git commit -m "feat: Add OAuth 2.1 support with PKCE and RFC compliance"
```

### 2. Pull Remote Changes

```bash
git pull origin main
```

This will trigger merge conflicts in these files:
- `.gitignore`
- `README.md`
- `package-lock.json`
- `src/auth/types.ts`
- `src/transports/sse/server.ts`
- `src/transports/sse/types.ts`

### 3. Resolve Each Conflict

#### A. `.gitignore` - TAKE BOTH

```bash
# Open the file and keep both versions merged
```

#### B. `README.md` - TAKE BOTH

Keep both OAuth section and any HTTP-stream documentation.

#### C. `package-lock.json` - REGENERATE

```bash
rm package-lock.json
npm install
git add package-lock.json
```

#### D. `src/auth/types.ts` - KEEP LOCAL (OAuth version)

Your OAuth changes added `headers` field - keep it:

```typescript
getAuthError?(): { status: number; message: string; headers?: Record<string, string> };
```

And `oauth` endpoint:

```typescript
endpoints?: {
  sse?: boolean;
  messages?: boolean;
  oauth?: boolean;
};
```

#### E. `src/transports/sse/server.ts` - MERGE CAREFULLY

This is the most complex merge. You need to:
1. Keep all OAuth methods: `handleProtectedResourceMetadata()`, `handleOAuthCallback()`
2. Keep OAuth imports: `OAuthProvider`
3. Merge with any HTTP-stream changes

#### F. `src/transports/sse/types.ts` - MERGE BOTH

Keep:
- OAuth configuration (`oauth?` field)
- Any HTTP-stream configuration

### 4. Update TransportType

After merge, update `src/core/MCPServer.ts`:

```typescript
export type TransportType = "stdio" | "sse" | "http-stream";
```

And in the `createTransport()` switch statement, ensure `http-stream` is handled.

### 5. Test the Merge

```bash
npm run build
```

If build succeeds, test both features work.

### 6. Complete the Merge

```bash
git add -A
git commit -m "Merge OAuth implementation with http-stream transport"
git push origin main
```

## Quick Conflict Resolution Strategy

For each conflicting file:

1. **Manual merge needed**:
   - `src/auth/types.ts` - Keep your OAuth additions
   - `src/transports/sse/server.ts` - Keep your OAuth methods + remote changes
   - `src/transports/sse/types.ts` - Keep your OAuth config + remote changes
   - `README.md` - Merge both documentations

2. **Accept remote**:
   - Files you didn't change significantly

3. **Regenerate**:
   - `package-lock.json` - Delete and run `npm install`

## If You Get Stuck

Run this to see conflict markers:

```bash
git diff --name-only --diff-filter=U
```

To see conflicts in a specific file:

```bash
git diff src/auth/types.ts
```

To accept your version (local):

```bash
git checkout --ours src/auth/types.ts
```

To accept their version (remote):

```bash
git checkout --theirs package-lock.json
```

## After Successful Merge

Update visa-proto to use either `sse` or `http-stream`:

```typescript
transport: {
  type: "http-stream",  // or "sse" - both should work
  options: {
    port: 3001,
    // ... OAuth config
  }
}
```

