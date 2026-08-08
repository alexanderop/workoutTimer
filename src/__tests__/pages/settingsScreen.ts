import { renderApp } from '../helpers/renderApp'
import { AppScreen } from './appScreen'

/** The settings route. */
export class SettingsScreen extends AppScreen {
  static async open(): Promise<SettingsScreen> {
    const app = await renderApp('/settings')
    return new SettingsScreen(app.container, app.cleanup)
  }
}
