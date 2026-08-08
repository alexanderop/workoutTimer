Feature: Workouts are local-first

  Scenario: A completed workout survives a reload
    Given I open the workout timer
    When I start an AMRAP workout
    Then the workout timer is running
    When I finish the workout
    And I save the workout result
    Then I see the workout details
    When I reload the workout timer
    Then I still see the workout details

  Scenario: The app shell works with the network gone
    Given I open the workout timer
    And the service worker controls the workout timer
    When the workout timer network goes away
    And I reload the workout timer
    Then the workout timer shell is on screen
    And the workout timer service worker served it

  Scenario: The shipped page announces itself
    Given I open the workout timer
    Then the workout timer document has a title and a language
