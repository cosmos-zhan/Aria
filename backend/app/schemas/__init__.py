from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator, Field

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
]
Content = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100000)
]
Description = Annotated[str, StringConstraints(max_length=100000)]
Reason = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)
]
Code = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9_-]{1,40}$")
]
TaskStatus = Literal["planned", "in_progress", "blocked", "implemented"]
FeatureStatus = Literal["planned", "in_progress", "blocked", "implementation_complete"]
ProposalStatus = Literal["draft", "candidate", "selected", "archived"]
DecisionStatus = Literal["proposed", "accepted", "rejected", "superseded"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Patch(Input):
    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set:
            raise ValueError("At least one update field is required")
        for name in self.model_fields_set:
            if getattr(self, name) is None and name not in {
                "milestone_id",
                "proposal_id",
            }:
                raise ValueError(f"{name} cannot be null")
        return self


class ProjectCreate(Input):
    name: Title
    description: Description = ""


class ProjectPatch(Patch):
    name: Title | None = None
    description: Description | None = None


class MilestoneCreate(Input):
    title: Title
    description: Description = ""
    order: int = Field(default=0, ge=0, le=10000)
    status: FeatureStatus = "planned"


class MilestonePatch(Patch):
    title: Title | None = None
    description: Description | None = None
    order: int | None = Field(default=None, ge=0, le=10000)
    status: FeatureStatus | None = None


class FeatureCreate(Input):
    code: Code
    title: Title
    description: Description = ""
    milestone_id: str | None = None
    status: FeatureStatus = "planned"


class FeaturePatch(Patch):
    code: Code | None = None
    title: Title | None = None
    description: Description | None = None
    milestone_id: str | None = None
    status: FeatureStatus | None = None


class TaskCreate(Input):
    feature_id: str
    title: Title
    description: Description = ""
    status: TaskStatus = "planned"


class TaskPatch(Patch):
    feature_id: str | None = None
    title: Title | None = None
    description: Description | None = None
    status: TaskStatus | None = None


class ProposalCreate(Input):
    feature_id: str
    title: Title
    status: ProposalStatus = "draft"
    content: Content
    change_reason: Reason = "Initial proposal"


class ProposalPatch(Patch):
    title: Title | None = None
    status: ProposalStatus | None = None


class ProposalRevisionCreate(Input):
    content: Content
    change_reason: Reason
    expected_version: int = Field(ge=1)


class Alternative(Input):
    title: Title
    description: Description = ""


class DecisionCreate(Input):
    feature_id: str
    proposal_id: str | None = None
    title: Title
    context: Content
    alternatives: list[Alternative] = Field(default_factory=list, max_length=20)
    selected_option: Annotated[str, StringConstraints(max_length=10000)] = ""
    rationale: Description = ""
    status: DecisionStatus = "proposed"
    change_reason: Reason = "Initial ADR"

    @model_validator(mode="after")
    def acceptance_evidence(self):
        if self.status == "accepted" and (
            not self.selected_option.strip() or not self.rationale.strip()
        ):
            raise ValueError(
                "Accepted ADR requires selected_option and rationale (technical decision, not test acceptance)"
            )
        return self


class DecisionRevisionCreate(DecisionCreate):
    expected_version: int = Field(ge=1)
    change_reason: Reason


class LinkCreate(Input):
    source_type: Literal["feature", "task", "proposal", "decision"]
    source_id: str
    target_type: Literal["feature", "task", "proposal", "decision"]
    target_id: str
    relation_type: Literal[
        "has_task", "has_proposal", "has_decision", "informs", "depends_on"
    ]
