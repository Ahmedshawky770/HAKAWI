/**
 * The dashboard — the first screen a signed-in reader sees.
 *
 * OWNED BY THE DASHBOARD SURFACE. The interface and the two tables live in one
 * file so the Arabic and the English of a sentence cannot drift apart.
 *
 * WHAT BELONGS HERE AND WHAT DOES NOT. The dashboard's OWN chrome — its title,
 * the three totals it sums, the heading over the latest stories — is said here.
 * The copy it SHARES with the rest of the product is not: the "write a story"
 * button is `shell.createStory`, the "no stories yet" title is `shell.noStories`
 * and the loading label is `common.loading`, because the dashboard and the
 * stories list render the SAME sentence and a sentence that exists in two
 * tables is a sentence that will be edited in one of them.
 */
export interface DashboardStrings {
  pageTitle: string;
  pageDescription: string;
  /** The label of the first total: the stories on screen. */
  statStoriesLabel: string;
  statViewsLabel: string;
  statReactionsLabel: string;
  latestStoriesHeading: string;
  /** The empty state's supporting line — its title is `shell.noStories`. */
  emptyDescription: string;
  loadFailedTitle: string;
}

export const AR: DashboardStrings = {
  pageTitle: "لوحة التحكم",
  pageDescription: "نظرة سريعة على ما منشور وما تفاعل معه القرّاء.",
  statStoriesLabel: "إجمالي القصص",
  statViewsLabel: "إجمالي المشاهدات",
  statReactionsLabel: "إجمالي التفاعلات",
  latestStoriesHeading: "أحدث القصص",
  emptyDescription: "لوحة التحكم تجمع ما تنشره هنا. اكتب أول قصة لتبدأ العدادات.",
  loadFailedTitle: "تعذّر تحميل لوحة التحكم",
};

export const EN: DashboardStrings = {
  pageTitle: "Dashboard",
  pageDescription: "A quick look at what you have published and what readers engaged with.",
  statStoriesLabel: "Total stories",
  statViewsLabel: "Total views",
  statReactionsLabel: "Total reactions",
  latestStoriesHeading: "Latest stories",
  emptyDescription: "The dashboard collects what you publish here. Write your first story to start the counters.",
  loadFailedTitle: "Couldn't load the dashboard",
};
