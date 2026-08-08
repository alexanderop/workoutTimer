import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'

/** The workout history route. */
export class HistoryScreen extends AppScreen {
  static async open(): Promise<HistoryScreen> {
    const app = await renderApp('/history')
    return new HistoryScreen(app.container, app.cleanup)
  }
}
