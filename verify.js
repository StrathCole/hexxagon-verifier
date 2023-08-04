const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const unzipper = require('unzipper');

const githubToken = '<YOURTOKEN>';
const repoOwner = 'classic-terra';
const workflowFileName = 'deploy.yml';
const baseURL = 'https://api.github.com';
const deployPath = `.github/workflows/${workflowFileName}`;
const storageKey = 'workflowFileHash';
const storageFilePath = '.storage.json';

const isBrowser = typeof window !== 'undefined';

axios.defaults.headers.common['Authorization'] = `Bearer ${githubToken}`;


let result = {
    last_check: '',
    station: {
        status_ok: false,
        latest_run_url: '',
        latest_commit_url: '',
        workflow_file: {
            changed: false,
            hash: '',
            prev_hash: ''
        },
        deployed_files: [],
    },
    finder: {
        status_ok: false,
        latest_run_url: '',
        latest_commit_url: '',
        workflow_file: {
            changed: false,
            hash: '',
            prev_hash: ''
        },
        deployed_files: [],
    },
    extension: {
    }
};


async function getPreviouslyStoredHash() {
    if (isBrowser) {
        return window.localStorage.getItem(storageKey);
    } else {
        if (!fs.existsSync(storageFilePath)) {
            fs.writeFileSync(storageFilePath, '{}');
        }

        try {
            const data = fs.readFileSync(storageFilePath, 'utf8');
            const json = JSON.parse(data);
            return json[storageKey];
        } catch (error) {
            console.error(`Error reading ${storageFilePath} file: ${error}`);
        }
    }
}

async function storeNewHash(hash) {
    if (isBrowser) {
        window.localStorage.setItem(storageKey, hash);
    } else {
        try {
            const json = { [storageKey]: hash };
            fs.writeFileSync('.storage.json', JSON.stringify(json));
        } catch (error) {
            console.error(`Error writing to .storage.json file: ${error}`);
        }
    }
}

async function fetchAndHashWorkflowFile(repoName) {
    try {
        const response = await axios.get(`https://raw.githubusercontent.com/${repoOwner}/${repoName}/master/${deployPath}`, { responseType: 'arraybuffer' });
        const fileHash = crypto.createHash('md5').update(response.data).digest('hex');
        console.log(`MD5 hash of the current workflow file: ${fileHash}`);
        
        const storedHash = await getPreviouslyStoredHash();

        if (fileHash === storedHash) {
            console.log(`Workflow file has not been changed.`);
        } else {
            console.log(`Workflow file has been changed.`);
            await storeNewHash(fileHash);
        }

        return fileHash;
    } catch (error) {
        console.error(`Error fetching and hashing workflow file: ${error}`);
    }
}

async function fetchAndHashWorkflowFileAtCommit(commitSHA, repoName) {
    try {
        const response = await axios.get(`${baseURL}/repos/${repoOwner}/${repoName}/contents/${deployPath}?ref=${commitSHA}`);
        const fileContent = Buffer.from(response.data.content, 'base64');
        const fileHash = crypto.createHash('md5').update(fileContent).digest('hex');
        return fileHash;
    } catch (error) {
        console.error(`Error fetching and hashing workflow file at commit ${commitSHA}: ${error}`);
    }
}

async function fetchLatestWorkflowRun(repoName) {
    try {
        const workflows = await axios.get(`${baseURL}/repos/${repoOwner}/${repoName}/actions/workflows`);
        const workflow = workflows.data.workflows.find(w => w.path.includes(workflowFileName));
        const runs = await axios.get(`${baseURL}/repos/${repoOwner}/${repoName}/actions/workflows/${workflow.id}/runs`);
        const latestRun = runs.data.workflow_runs[0];

        const runCommitHash = await fetchAndHashWorkflowFileAtCommit(latestRun.head_sha, repoName);
        const currentCommitHash = await fetchAndHashWorkflowFile(repoName);

        if (runCommitHash === currentCommitHash) {
            console.log(`The workflow file has not been changed since the last run.`);
        } else {
            result[repoName].workflow_file.changed = true;
            console.log(`The workflow file has been changed since the last run: ${runCommitHash} !== ${currentCommitHash}`);
        }

        result[repoName].workflow_file.hash = currentCommitHash;
        result[repoName].workflow_file.prev_hash = runCommitHash;
        result.last_check = Math.floor(new Date().getTime() / 1000);
        result[repoName].latest_run_url = latestRun.html_url;
        result[repoName].latest_commit_url = latestRun.head_commit.url;

        return latestRun;
    } catch (error) {
        console.error(`Error fetching workflow run: ${error}`);
    }
}

async function downloadAndUnzipArtifact(run) {
    try {
        const artifacts = await axios.get(run.artifacts_url);
        const artifact = artifacts.data.artifacts[0];
        const download = await axios.get(artifact.archive_download_url, { responseType: 'stream' });

        const artifactPath = `./${artifact.name}.zip`;
        const writer = fs.createWriteStream(artifactPath);
        
        return new Promise((resolve, reject) => {
            download.data.pipe(writer)
                .on('finish', () => {
                    fs.createReadStream(artifactPath)
                        .pipe(unzipper.Parse())
                        .on('entry', async function (entry) {
                            if (entry.type === 'File') {
                                const content = await entry.buffer();
                                const lines = content.toString().split('\n');
                                resolve(lines);
                            } else {
                                entry.autodrain();
                            }
                        });
                })
                .on('error', reject);
        });
    } catch (error) {
        console.error(`Error downloading artifact: ${error}`);
    }
}

async function verifyHashes(lines, repoName) {
    for (let line of lines) {
        if (line) {
            let [hash, url] = line.split('  ');
            await verifyHash(hash, url, repoName);
        }
    }
}

async function verifyHash(hash, url, repoName) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const fileHash = crypto.createHash('md5').update(response.data).digest('hex');
        const isOk = fileHash === hash;

        if (isOk) {
            console.log(`Verifying ${url}: OK`)
        } else {
            console.log(`Verifying ${url}: MISMATCH`)
        }

        result[repoName].deployed_files.push({
            file: url,
            hash: hash,
            deployed_hash: fileHash,
            ok: isOk
        });
    } catch (error) {
        console.error(`Error verifying file at ${url}: ${error}`);
    }
}

fetchLatestWorkflowRun("station")
    .then(downloadAndUnzipArtifact)
    .then((lines) => verifyHashes(lines, "station"))
    .then(() => fetchLatestWorkflowRun("finder"))
    .then(downloadAndUnzipArtifact)
    .then((lines) => verifyHashes(lines, "finder"))
    .then(() => {
        result["station"].status_ok = result["station"].deployed_files.every(file => file.ok);
        result["finder"].status_ok = result["finder"].deployed_files.every(file => file.ok);
    })
    .then(() => fs.writeFileSync('.result.json', JSON.stringify(result, null, 2)))
    .catch(error => console.error(`Error in script: ${error}`));
