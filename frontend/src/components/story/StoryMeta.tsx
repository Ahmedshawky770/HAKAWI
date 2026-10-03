import React from "react";
import Link from "next/link";

export const UNCATEGORIZED_LABEL = "بدون تصنيف";
export const AUTHOR_PROFILE_LABEL = "ملف الكاتب";

interface StoryAuthor {
  id: string;
  name: string | null;
}

interface StoryBylineProps {
  author: StoryAuthor;
  linkToProfile?: boolean;
  className?: string;
}

export function StoryByline({ author, linkToProfile = false, className = "" }: StoryBylineProps) {
  const name = author.name?.trim() ?? "";
  const href = `/users/${author.id}`;

  if (!name && !linkToProfile) return null;

  if (!name) {
    return (
      <Link href={href} aria-label={AUTHOR_PROFILE_LABEL} className={`text-blue-600 ${className}`}>
        {AUTHOR_PROFILE_LABEL}
      </Link>
    );
  }

  if (linkToProfile) {
    return (
      <Link href={href} className={`text-blue-600 hover:text-blue-500 ${className}`}>
        بواسطة {name}
      </Link>
    );
  }

  return <p className={className}>بواسطة {name}</p>;
}

interface StoryCategoryProps {
  category: string | null;
  variant?: "chip" | "inline";
  className?: string;
}

export function StoryCategory({ category, variant = "chip", className = "" }: StoryCategoryProps) {
  const label = category?.trim() ? category : UNCATEGORIZED_LABEL;
  const uncategorized = label === UNCATEGORIZED_LABEL;

  if (variant === "inline") {
    return <span className={`capitalize ${uncategorized ? "italic" : ""} ${className}`}>{label}</span>;
  }

  return (
    <span
      className={`inline-block px-2 py-1 rounded text-xs capitalize ${
        uncategorized ? "bg-gray-50 text-gray-500 border border-dashed border-gray-300" : "bg-gray-100 text-gray-700"
      } ${className}`}
    >
      {label}
    </span>
  );
}
