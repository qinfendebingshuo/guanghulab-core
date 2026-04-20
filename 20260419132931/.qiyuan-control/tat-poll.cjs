const sdk = require('tencentcloud-sdk-nodejs');

const region = process.env.QY_TCLOUD_REGION_PROD || 'ap-shanghai';
const instanceId = process.env.QY_LH_INSTANCE_ID_PROD;
const secretId = process.env.QY_TCLOUD_SECRET_ID_PROD;
const secretKey = process.env.QY_TCLOUD_SECRET_KEY_PROD;
const invocationId = process.argv[2];

(async () => {
  const client = new sdk.tat.v20201028.Client({
    credential: { secretId, secretKey },
    region,
    profile: { httpProfile: { endpoint: 'tat.tencentcloudapi.com' } },
  });
  const detail = await client.DescribeInvocationTasks({
    Filters: [
      { Name: 'invocation-id', Values: [invocationId] },
      { Name: 'instance-id', Values: [instanceId] },
    ],
    HideOutput: false,
  });
  const task = detail.InvocationTaskSet && detail.InvocationTaskSet[0];
  if (!task) {
    console.log(JSON.stringify({ invocationId, status: 'NOT_FOUND' }, null, 2));
    return;
  }
  const outputBase64 = task.TaskResult && task.TaskResult.Output ? task.TaskResult.Output : '';
  const output = outputBase64 ? Buffer.from(outputBase64, 'base64').toString('utf8') : '';
  console.log(JSON.stringify({
    invocationId,
    status: task.TaskStatus,
    exitCode: task.TaskResult && task.TaskResult.ExitCode,
    output,
    startTime: task.StartTime,
    endTime: task.EndTime,
  }, null, 2));
})().catch((err) => {
  console.error(err && (err.stack || err.message || JSON.stringify(err)));
  process.exit(1);
});
