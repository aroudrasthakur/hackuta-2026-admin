import { APPLICATION_QUESTIONS } from "../../shared/registration/constants";
import type { ApplicationDetail as ApplicationDetailData } from "../convex/adminApi";
import { applicationLink, formatApplicationAnswer, formatApplicationDate } from "../lib/applicationDisplay";

type Field = keyof ApplicationDetailData["application"];
type Section = { title: string; fields: readonly (readonly [Field, string])[] };

const sections: readonly Section[] = [
  { title: "Personal and contact information", fields: [
    ["firstName", "First name"], ["lastName", "Last name"], ["age", "Age"],
    ["email", "Email"], ["studentEmail", "Student email"],
    ["phone", "Phone number"], ["phoneCountry", "Phone country"],
    ["countryOfResidence", "Country of residence"], ["stateOfResidence", "State of residence"],
    ["gender", "Gender"], ["otherGender", "Self-described gender"],
    ["raceEthnicity", "Race / ethnicity"], ["otherRaceEthnicity", "Other race / ethnicity"],
    ["tshirtSize", "T-shirt size"],
  ] },
  { title: "Education", fields: [
    ["school", "School"], ["otherSchool", "Other school"],
    ["levelOfStudy", "Level of study"], ["otherLevelOfStudy", "Other level of study"],
    ["major", "Major"], ["otherMajor", "Other major"],
    ["graduationYear", "Graduation year"], ["internationalStudent", "International student"],
  ] },
  { title: "Technical and hackathon background", fields: [
    ["experienceLevel", "Experience level"], ["hackathonsAttended", "Hackathons attended"],
    ["linkedin", "LinkedIn"], ["github", "GitHub"], ["portfolio", "Portfolio"], ["devpost", "Devpost"],
  ] },
  { title: "Application responses", fields: [
    ["builtOrWantToBuild", APPLICATION_QUESTIONS.builtOrWantToBuild],
    ["shortDeadlineLearning", APPLICATION_QUESTIONS.shortDeadlineLearning],
    ["hearAbout", "How did you hear about HackUTA?"], ["otherHearAbout", "Other referral source"],
  ] },
  { title: "Dietary and allergy information", fields: [
    ["dietaryRestrictions", "Dietary restrictions"],
    ["otherDietaryRestrictions", "Other dietary restrictions"], ["allergyDetails", "Allergy details"],
  ] },
  { title: "Accessibility", fields: [["accessibilityNeeds", "Accessibility needs"]] },
  { title: "Emergency contact", fields: [
    ["emergencyContactName", "Contact name"], ["emergencyContactRelationship", "Relationship"],
    ["emergencyContactPhone", "Contact phone"], ["emergencyContactPhoneCountry", "Contact phone country"],
  ] },
  { title: "MLH and consent information", fields: [
    ["mlhCodeOfConductAgreed", "MLH code of conduct agreement"],
    ["mlhCodeOfConductAgreedAt", "Code of conduct agreed at"],
    ["mlhDataSharingConsent", "MLH data sharing consent"],
    ["mlhDataSharingConsentAt", "MLH data sharing consent recorded at"],
    ["mlhCommunicationsConsent", "MLH communications consent"],
    ["mlhCommunicationsConsentAt", "MLH communications consent recorded at"],
    ["sponsorSharingConsent", "Sponsor sharing consent"],
    ["sponsorSharingConsentAt", "Sponsor sharing consent recorded at"],
    ["foodAllergyWaiverAgreed", "Food allergy waiver agreement"],
    ["foodAllergyWaiverAgreedAt", "Food allergy waiver agreed at"],
  ] },
];

const linkFields: readonly Field[] = ["linkedin", "github", "portfolio", "devpost"];
const wideFields: readonly Field[] = ["builtOrWantToBuild", "shortDeadlineLearning", "accessibilityNeeds"];
const statusLabels = {
  under_review: "Under Review", accepted: "Accepted", waitlisted: "Waitlisted",
  rejected: "Rejected", withdrawn: "Withdrawn",
};

export function ApplicationDetail({ detail }: { detail: ApplicationDetailData }) {
  const { application, reviewStatus, resume } = detail;
  const name = [application.firstName, application.lastName]
    .filter((value) => typeof value === "string" && value.trim()).join(" ");

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-display text-2xl text-night">{name || "Application review"}</h2>
        <p className="break-all text-sm text-ocean">{application.email}</p>
        <p className="text-sm">Submitted: {formatApplicationDate(application.submittedAt)}</p>
        <p className="text-sm">Review status: {reviewStatus ? statusLabels[reviewStatus] : "Unreviewed"}</p>
      </header>
      {sections.map(({ title, fields }) => (
        <section key={title} aria-label={title} className="rounded-lg border border-sand bg-white/40 p-5">
          <h3 className="font-display text-lg text-night">{title}</h3>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            {fields.map(([field, label]) => {
              const value: unknown = application[field];
              const href = linkFields.includes(field) ? applicationLink(value) : null;
              return (
                <div key={field} className={`min-w-0 ${wideFields.includes(field) ? "sm:col-span-2" : ""}`}>
                  <dt className="text-sm font-semibold text-ocean">{label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="underline">
                        {formatApplicationAnswer(value)}
                      </a>
                    ) : field.endsWith("At") ? formatApplicationDate(value) : formatApplicationAnswer(value)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
      <section aria-label="Resume" className="rounded-lg border border-sand bg-white/40 p-5">
        <h3 className="font-display text-lg text-night">Resume</h3>
        {resume.status === "available" && resume.url ? (
          <a className="mt-3 inline-block break-all underline" href={resume.url} target="_blank" rel="noreferrer">
            {resume.filename || "Open resume (PDF)"}
          </a>
        ) : (
          <p className="mt-3 text-sm text-ocean">
            {resume.status === "missing" ? "The attached resume is no longer available." : "No resume was attached."}
          </p>
        )}
      </section>
    </article>
  );
}
