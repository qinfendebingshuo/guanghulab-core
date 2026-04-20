const fs = require('fs');
const path = require('path');
const sdk = require('tencentcloud-sdk-nodejs');

const region = process.env.QY_TCLOUD_REGION_PROD || 'ap-shanghai';
const instanceId = process.env.QY_LH_INSTANCE_ID_PROD;
const secretId = process.env.QY_TCLOUD_SECRET_ID_PROD;
const secretKey = process.env.QY_TCLOUD_SECRET_KEY_PROD;
const commandPath = process.argv[2];
const commandName = process.argv[3] || 'qiyuan-tat-command';
const timeout = Number(process.argv[4] || 7200);

(async () => {
  const content = fs.readFileSync(path.resolve(commandPath), 'utf8');
  const client = new sdk.tat.v20201028.Client({
    credential: { secretId, secretKey },
    region,
    profile: { httpProfile: { endpoint: 'tat.tencentcloudapi.com' } },
  });
  const res = await client.RunCommand({
    Content: Buffer.from(content).toString('base64'),
    InstanceIds: [instanceId],
    CommandName: commandName,
    Description: commandName,
    CommandType: 'SHELL',
    Timeout: timeout,
    WorkingDirectory: '/root',
    SaveCommand: false,
  });
  console.log(JSON.stringify({ invocationId: res.InvocationId }, null, 2));
})().catch((err) => {
  console.error(err && (err.stack || err.message || JSON.stringify(err)));
  process.exit(1);
});
