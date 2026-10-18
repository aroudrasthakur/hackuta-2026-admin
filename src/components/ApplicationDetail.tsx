import { ResumePreview } from "./ResumePreview";
import { APPLICATION_QUESTIONS } from "../../shared/registration/constants";
import { useEffect, useRef, type ReactNode } from "react";
import type { ApplicationDetail as ApplicationDetailData } from "../convex/adminApi";
import { applicationLink, formatApplicationAnswer, formatApplicationDate } from "../lib/applicationDisplay";
import { dashboardReviewStatusLabel } from "../lib/applicationDisplay";
import { ApplicationStatusBadge } from "./ApplicationStatusBadge";

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
const primaryTitles = ["Application responses", "Technical and hackathon background", "Education"];

export function ApplicationDetail({ detail, children }: { detail: ApplicationDetailData; children?: ReactNode }) {
  const { application, reviewStatus, resume } = detail;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [application._id]);
  const displayedStatus = reviewStatus === "under_review"
    ? !detail.reviewActivity.reviewedBy ? "unreviewed" : detail.reviewActivity.isStale ? "stale" : "under_review"
    : reviewStatus;
  const name = [application.firstName, application.lastName]
    .filter((value) => typeof value === "string" && value.trim()).join(" ");

  function renderSection({ title, fields }: Section) {
    return (
      <section key={title} aria-label={title} className="admin-card admin-card__body">
        <h3 className="admin-card__title">{title}</h3>
        <dl className="mt-4 grid gap-5 sm:grid-cols-2">
          {fields.map(([field, label]) => {
            const value: unknown = application[field];
            const href = linkFields.includes(field) ? applicationLink(value) : null;
            const answer = field === "dietaryRestrictions" && Array.isArray(value) && value.length === 0
              ? "None selected"
              : formatApplicationAnswer(value);
            return (
              <div key={field} className={`min-w-0 ${wideFields.includes(field) ? "sm:col-span-2" : ""}`}>
                <dt className="text-sm font-semibold text-ocean">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-ocean underline underline-offset-4">
                      {answer}
                    </a>
                  ) : field.endsWith("At") ? formatApplicationDate(value) : answer}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    );
  }

  return (
    <article className="space-y-6">
      <header className="admin-card admin-card__body space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-night">{name || "Application review"}</h2>
            <p className="break-words text-sm text-ocean">{application.email}</p>
          </div>
          <ApplicationStatusBadge status={displayedStatus} />
        </div>
        <p className="text-sm text-night">
          Submitted: {formatApplicationDate(application.submittedAt)}
          <span aria-hidden="true"> · </span>
          Review status: {dashboardReviewStatusLabel(displayedStatus)}
        </p>
      </header>
      <div className={`grid items-start gap-6 ${children ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
        <div className="min-w-0 space-y-5">
          {primaryTitles.map((title) => renderSection(sections.find((section) => section.title === title)!))}
          <ResumePreview key={application._id} resume={resume} />
        </div>
        {children && <aside aria-label="Review actions" className="min-w-0 space-y-5 lg:sticky lg:top-24">{children}</aside>}
        <details className="admin-card admin-card__body admin-disclosure min-w-0 lg:col-span-full">
          <summary>Additional applicant information</summary>
          <p className="mb-4 mt-3 text-sm text-ocean">Contact details, dietary and accessibility needs, emergency contact, and consent records.</p>
          <div className="space-y-5">{sections.filter((section) => !primaryTitles.includes(section.title)).map(renderSection)}</div>
        </details>
      </div>
    </article>
  );
}
