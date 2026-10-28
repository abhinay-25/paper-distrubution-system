/**
 * Topic service — business logic for syllabus topic management.
 *
 * Topics belong to a Subject which belongs to an Institution.
 * Cross-institution topic references are rejected in question creation.
 */

import { db } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { getSubject } from "./subjectService.js";
import type { CreateTopicInput, UpdateTopicInput } from "../schemas/academic.js";

export interface TopicRow {
  id: string;
  institutionId: string;
  subjectId: string;
  name: string;
  code: string | null;
  description: string | null;
  sequenceOrder: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// List topics for a subject
// ---------------------------------------------------------------------------

export async function listTopics(institutionId: string, subjectId: string): Promise<TopicRow[]> {
  // Ownership check — throws 404 if not found / wrong institution.
  await getSubject(institutionId, subjectId);

  return db.topic.findMany({
    where: { subjectId, institutionId },
    orderBy: [{ sequenceOrder: "asc" }, { name: "asc" }],
  });
}

// ---------------------------------------------------------------------------
// Get single topic
// ---------------------------------------------------------------------------

export async function getTopic(
  institutionId: string,
  subjectId: string,
  topicId: string,
): Promise<TopicRow> {
  const topic = await db.topic.findFirst({
    where: { id: topicId, subjectId, institutionId },
  });
  if (!topic) throw AppError.notFound("Topic not found");
  return topic;
}

// ---------------------------------------------------------------------------
// Create topic
// ---------------------------------------------------------------------------

export async function createTopic(
  institutionId: string,
  subjectId: string,
  input: CreateTopicInput,
): Promise<TopicRow> {
  // Ensure parent subject exists and belongs to institution.
  await getSubject(institutionId, subjectId);

  return db.topic.create({
    data: { institutionId, subjectId, ...input },
  });
}

// ---------------------------------------------------------------------------
// Update topic
// ---------------------------------------------------------------------------

export async function updateTopic(
  institutionId: string,
  subjectId: string,
  topicId: string,
  input: UpdateTopicInput,
): Promise<TopicRow> {
  await getTopic(institutionId, subjectId, topicId); // ownership check

  return db.topic.update({
    where: { id: topicId },
    data: input,
  });
}
