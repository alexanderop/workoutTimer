import { createBdd, test as base } from 'playwright-bdd'
import { WorkoutPage } from './pages/workoutPage'

/** Page objects exposed as fixtures to generated Gherkin tests. */
export const test = base.extend<{ workout: WorkoutPage }>({
  workout: async ({ page }, use) => {
    await use(new WorkoutPage(page))
  },
})

export const { After, Given, Then, When } = createBdd(test)
