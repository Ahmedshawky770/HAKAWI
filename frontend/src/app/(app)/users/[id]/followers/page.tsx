import { Metadata } from "next";

import { stringsFor } from "@/lib/i18n";

import { FollowersList } from "./FollowersList";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * The metadata is the default locale's.
 *
 * The reader's language is a preference in `localStorage`, which the server
 * cannot read, so the tab title is the Arabic one — the same trade every
 * server-rendered title in the product makes. The page BODY is not: the list
 * is a client component and follows the language toggle.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const strings = stringsFor("ar");
  return {
    title: strings.social.followersPageTitle(id),
    description: strings.social.followersDescription,
  };
}

export default async function UserFollowersPage({ params }: Props) {
  const { id } = await params;

  return <FollowersList userId={id} />;
}
