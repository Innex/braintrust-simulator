"use client";

import { useState } from "react";
import { X, Pencil, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { type ExtractedProfile } from "@/lib/types";

interface ExtractedProfileCardProps {
  profile: ExtractedProfile;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ExtractedProfile>) => void;
}

export function ExtractedProfileCard({
  profile,
  onRemove,
  onUpdate,
}: ExtractedProfileCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(profile.persona.name);
  const [editDescription, setEditDescription] = useState(profile.persona.description);
  const [editGoal, setEditGoal] = useState(profile.goal.description);
  const [editCriteria, setEditCriteria] = useState(profile.goal.successCriteria);

  const handleSave = () => {
    onUpdate(profile.id, {
      persona: {
        ...profile.persona,
        name: editName,
        description: editDescription,
      },
      goal: {
        ...profile.goal,
        description: editGoal,
        successCriteria: editCriteria,
      },
    });
    setEditing(false);
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {editing ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-7 text-sm font-medium"
            />
          ) : (
            <span className="text-sm font-medium truncate">{profile.persona.name}</span>
          )}
          <Badge variant="secondary" className="shrink-0 text-xs">
            {profile.persona.isPreset ? profile.persona.id : "custom"}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <Button type="button" variant="ghost" size="sm" onClick={handleSave}>
              <Check className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(profile.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Persona description</label>
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Goal</label>
            <Textarea
              value={editGoal}
              onChange={(e) => setEditGoal(e.target.value)}
              rows={2}
              className="text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Success criteria</label>
            <Textarea
              value={editCriteria}
              onChange={(e) => setEditCriteria(e.target.value)}
              rows={2}
              className="text-xs"
            />
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{profile.goal.description}</p>
          {profile.sourcePreview && (
            <p className="text-xs italic text-muted-foreground/70 truncate">
              Source: &ldquo;{profile.sourcePreview}&rdquo;
            </p>
          )}
        </>
      )}
    </div>
  );
}
