import { After, Given, Then, When } from '../fixtures'

After(async ({ workout }) => {
  await workout.goOnline()
})

Given('I open the workout timer', async ({ workout }) => {
  await workout.open()
})

Given('the service worker controls the workout timer', async ({ workout }) => {
  await workout.waitForServiceWorkerControl()
})

When('I start an AMRAP workout', async ({ workout }) => {
  await workout.startAmrap()
})

Then('the workout timer is running', async ({ workout }) => {
  await workout.expectRunning()
})

When('I finish the workout', async ({ workout }) => {
  await workout.finish()
})

When('I save the workout result', async ({ workout }) => {
  await workout.saveResult('E2E complete')
})

Then('I see the workout details', async ({ workout }) => {
  await workout.expectResult('E2E complete')
})

Then('I still see the workout details', async ({ workout }) => {
  await workout.expectResult('E2E complete')
})

When('the workout timer network goes away', async ({ workout }) => {
  await workout.goOffline()
})

When('I reload the workout timer', async ({ workout }) => {
  await workout.reload()
})

Then('the workout timer shell is on screen', async ({ workout }) => {
  await workout.expectShellVisible()
})

Then('the workout timer service worker served it', async ({ workout }) => {
  await workout.expectServedByServiceWorker()
})

Then('the workout timer document has a title and a language', async ({ workout }) => {
  await workout.expectDocumentAnnounced()
})
