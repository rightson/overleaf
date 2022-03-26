const minimist = require('minimist')
const util = require('util')
const { waitForDb } = require('../../../app/src/infrastructure/mongodb')
const UserGetter = require('../../../app/src/Features/User/UserGetter')
const AuthenticationManager = require('../../../app/src/Features/Authentication/AuthenticationManager')
const getUser = util.promisify(UserGetter.getUser)

async function main() {
  await waitForDb()

  const argv = minimist(process.argv.slice(2), {
    string: ['email'],
    string: ['password'],
  })

  const { email, password } = argv
  if (!email) {
    console.error(`Usage: node ${__filename} --password=password --email=joe@example.com`)
    process.exit(1)
  }

  const user = await getUser({ email });
  await AuthenticationManager.promises.setUserPassword(
    user,
    password
  )
}

main()
  .then(() => {
    console.error('Done.')
    process.exit(0)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })