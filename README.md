## Installing Dependencies

### Node.js

First install Node.js (LTS recommended) from `https://nodejs.org`, then install project packages:

```bash
npm install
```

### Google Cloud CLI (`gcloud`)

Install the `gcloud` CLI, which is required for authenticating with Google Earth Engine and managing GEE module repos.

**macOS** (via Homebrew):

```bash
brew install --cask google-cloud-sdk
```

**macOS / Linux** (manual):

```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL   # restart your shell
```

**Windows**: Download and run the installer from `https://cloud.google.com/sdk/docs/install`.

After installing, initialize and log in:

```bash
gcloud init
gcloud auth login
```

## Cloning the Repository

```bash
git clone https://github.com/your-org/bulcd-runner.git
cd bulcd-runner
```

If you also need the associated GEE modules locally:

```bash
gcloud auth login           # if not already authenticated
npm run setup               # clones and refreshes gee_modules/
```

## Setting Up Authentication

Create a Google Cloud service account with Earth Engine access and download the JSON key, then either:

```bash
# Option 1: place the key in the project root
mv ~/Downloads/your-service-account-key.json ./service-account-key.json

# Option 2: point to it explicitly
export GEE_KEY_PATH=/absolute/path/to/your-service-account-key.json
```

## Running the Runner

Run an experiment:

```bash
node runner11.js scripts_to_run/BULCD-Caller-v51e.js gee_modules experiments/BULCD-Params.json
```

Or use the npm scripts if defined in `package.json`:

```bash
npm run run:default   # default params
```
