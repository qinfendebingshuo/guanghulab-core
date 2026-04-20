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

if (!secretId || !secretKey || !instanceId || !commandPath) {
  console.error('Missing required env or args');
  process.exit(1);
}

const content = fs.readFileSync(path.resolve(commandPath), 'utf8');
const client = new sdk.tat.v20201028.Client({
  credential: { secretId, secretKey },
  region,
  profile: { httpProfile: { endpoint: 'tat.tencentcloudapi.com' } },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const runResp = await client.RunCommand({
    Content: Buffer.from(content).toString('base64'),
    InstanceIds: [instanceId],
    CommandName: commandName,
    Description: commandName,
    CommandType: 'SHELL',
    Timeout: timeout,
    WorkingDirectory: '/root',
    SaveCommand: false,
  });

  const invocationId = runResp.InvocationId;
  if (!invocationId) {
    throw new Error('No InvocationId returned');
  }

  for (let i = 0; i < 240; i += 1) {
    await sleep(5000);
    const detail = await client.DescribeInvocationTasks({
      Filters: [
        { Name: 'invocation-id', Values: [invocationId] },
        { Name: 'instance-id', Values: [instanceId] },
      ],
      HideOutput: false,
    });

    const task = detail.InvocationTaskSet && detail.InvocationTaskSet[0];
    if (!task) continue;

    const status = task.TaskStatus;
    if (['SUCCESS', 'FAILED', 'TIMEOUT', 'DELIVER_FAILED', 'START_FAILED', 'TASK_TIMEOUT', 'CANCELLED', 'TERMINATED'].includes(status)) {
      const outputBase64 = task.TaskResult && task.TaskResult.Output ? task.TaskResult.Output : '';
      const output = outputBase64 ? Buffer.from(outputBase64, 'base64').toString('utf8') : '';
      const result = {
        invocationId,
        status,
        exitCode: task.TaskResult && task.TaskResult.ExitCode,
        output,
        startTime: task.StartTime,
        endTime: task.EndTime,
      };
      console.log(JSON.stringify(result, null, 2));
      process.exit(status === 'SUCCESS' ? 0 : 1);
    }
  }

  throw new Error(`Invocation ${invocationId} polling timeout`);
})().catch((err) => {
  console.error(err && (err.stack || err.message || JSON.stringify(err)));
  process.exit(1);
});
