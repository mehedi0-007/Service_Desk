import { z } from "zod";
import { REQUEST_CATEGORIES, REQUEST_PRIORITIES } from "./types";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),
});
export type LoginValues = z.infer<typeof loginSchema>;

// Same limits as the backend's CreateRequestDto.
export const createRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title must be at most 120 characters"),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(2000, "Description must be at most 2000 characters"),
  category: z.enum(REQUEST_CATEGORIES, {
    errorMap: () => ({ message: "Choose a category" }),
  }),
  priority: z.enum(REQUEST_PRIORITIES),
});
export type CreateRequestValues = z.infer<typeof createRequestSchema>;
