type DecisionKind = "accepted" | "rejected" | "waitlisted";

const copy: Record<
  DecisionKind,
  { subject: string; lead: string; closing: string }
> = {
  accepted: {
    subject: "You're accepted to HackUTA!",
    lead: "Congratulations! Your HackUTA application has been accepted.",
    closing:
      "We will follow up with event details as the hackathon approaches. We can't wait to see you there!",
  },
  rejected: {
    subject: "Update on your HackUTA application",
    lead: "Thank you for applying to HackUTA. After careful review, we are unable to offer you a spot this year.",
    closing:
      "We appreciate the time you spent on your application and encourage you to apply again in the future.",
  },
  waitlisted: {
    subject: "You're on the HackUTA waitlist",
    lead: "Thank you for applying to HackUTA. You have been placed on our waitlist.",
    closing:
      "We will email you if a spot opens up. No further action is needed from you right now.",
  },
};

export function buildDecisionEmailContent(args: {
  decision: DecisionKind;
  applicantName: string;
  hackathonName: string;
}) {
  const section = copy[args.decision];
  const greeting = args.applicantName.trim() ? `Hi ${args.applicantName.trim()},` : "Hi,";
  const text = [
    greeting,
    "",
    section.lead.replace("HackUTA", args.hackathonName),
    "",
    section.closing,
    "",
    `— ${args.hackathonName} organizers`,
  ].join("\n");

  return {
    subject: section.subject.replace("HackUTA", args.hackathonName),
    text,
  };
}
