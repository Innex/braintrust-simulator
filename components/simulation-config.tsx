"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Play, Plus, X, ExternalLink, Loader2, Info, Database } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { simulationConfigSchema, type SimulationConfigFormValues } from "@/lib/schemas";
import { PRESET_PERSONAS } from "@/lib/personas";
import { type Persona, type Scorer, type ScorerConfig } from "@/lib/types";
import { useBraintrust } from "@/hooks/use-braintrust";
import { useSimulation } from "@/hooks/use-simulation";
import { useDatasetProfiles } from "@/hooks/use-dataset-profiles";
import { ExtractedProfileCard } from "@/components/extracted-profile-card";
import {
  getStoredApiKey,
  setStoredApiKey,
  getStoredProject,
  setStoredProject,
} from "@/lib/storage";

const MODELS = [
  { value: "gpt-5-nano", label: "GPT-5 Nano (Cheapest)" },
  { value: "gpt-5-mini", label: "GPT-5 Mini (Fast)" },
  { value: "gpt-5", label: "GPT-5 (Best)" },
];

export function SimulationConfig() {
  const [apiKey, setApiKey] = useState<string>("");
  const [apiKeyValid, setApiKeyValid] = useState(false);
  const [customPersonaOpen, setCustomPersonaOpen] = useState(false);
  const [newPersona, setNewPersona] = useState({ name: "", description: "", systemPrompt: "" });
  const [selectedPersonas, setSelectedPersonas] = useState<Persona[]>([]);
  const [goals, setGoals] = useState<Array<{ id: string; description: string; successCriteria: string }>>([]);
  const [selectedScorers, setSelectedScorers] = useState<ScorerConfig[]>([]);
  const [customScorerOpen, setCustomScorerOpen] = useState(false);
  const [newCustomScorer, setNewCustomScorer] = useState({
    name: "",
    description: "",
    promptTemplate: "",
    choiceScores: {} as Record<string, number>,
    choiceInput: "",
    scoreInput: "",
    useCoT: true,
  });

  const [profileSource, setProfileSource] = useState<"manual" | "dataset">("manual");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);

  const { projects, datasets, evalNames, evalScorers, orgName: resolvedOrgName, scorers, loading: projectsLoading, datasetsLoading, evalNamesLoading, evalNamesError, scorersLoading, error: projectsError, fetchProjects, fetchDatasets, fetchEvalNames, fetchScorers } = useBraintrust(apiKey);
  const { status, progress, experimentUrl, mode, error: simError, runSimulation, reset } = useSimulation();
  const { profiles: extractedProfiles, extracting, extractionError, extractFromDataset, removeProfile: removeExtractedProfile, updateProfile: updateExtractedProfile, clearProfiles } = useDatasetProfiles(apiKey);

  const form = useForm<SimulationConfigFormValues>({
    resolver: zodResolver(simulationConfigSchema),
    defaultValues: {
      braintrustApiKey: "",
      projectId: "",
      projectName: "",
      experimentName: "",
      target: { type: "api", endpoint: "" },
      personas: [],
      goals: [],
      settings: {
        maxTurns: 10,
        parallelRuns: 5,
        simulatorModel: "gpt-5-mini",
        temperature: 0.5,
        stopOnGoalAchieved: true,
      },
      scorers: [],
      profileMode: "matrix",
      pairedProfiles: undefined,
    },
  });

  // Auto-populate org name from resolved value
  useEffect(() => {
    if (resolvedOrgName && form.watch("target.type") === "remote-eval") {
      form.setValue("target.orgName", resolvedOrgName);
    }
  }, [resolvedOrgName, form]);

  // Auto-select eval name when only one is discovered
  useEffect(() => {
    if (evalNames.length === 1) {
      form.setValue("target.evalName", evalNames[0], { shouldValidate: true });
    }
  }, [evalNames, form]);

  // Sync selectedPersonas to form
  useEffect(() => {
    form.setValue("personas", selectedPersonas);
  }, [selectedPersonas, form]);

  // Sync goals to form
  useEffect(() => {
    form.setValue("goals", goals);
  }, [goals, form]);

  // Sync scorers to form
  useEffect(() => {
    form.setValue("scorers", selectedScorers);
  }, [selectedScorers, form]);

  // Sync profile mode and extracted profiles to form
  useEffect(() => {
    if (profileSource === "dataset" && extractedProfiles.length > 0) {
      form.setValue("profileMode", "paired");
      form.setValue(
        "pairedProfiles",
        extractedProfiles.map((p) => ({ persona: p.persona, goal: p.goal }))
      );
      form.setValue(
        "personas",
        extractedProfiles.map((p) => p.persona)
      );
      form.setValue(
        "goals",
        extractedProfiles.map((p) => p.goal)
      );
    } else {
      form.setValue("profileMode", "matrix");
      form.setValue("pairedProfiles", undefined);
    }
  }, [profileSource, extractedProfiles, form]);

  // Load stored API key on mount
  useEffect(() => {
    const stored = getStoredApiKey();
    if (stored) {
      setApiKey(stored);
      form.setValue("braintrustApiKey", stored);
    }
    const storedProject = getStoredProject();
    if (storedProject) {
      form.setValue("projectId", storedProject.id);
      form.setValue("projectName", storedProject.name);
      if (stored) {
        fetchScorers(storedProject.id);
        fetchDatasets(storedProject.id);
      }
    }
  }, [form, fetchScorers, fetchDatasets]);

  // Fetch projects when API key changes
  useEffect(() => {
    if (apiKey && apiKey.length > 10) {
      fetchProjects().then(() => setApiKeyValid(true)).catch(() => setApiKeyValid(false));
    }
  }, [apiKey, fetchProjects]);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    form.setValue("braintrustApiKey", value);
    setStoredApiKey(value);
  };

  const handleProjectChange = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      form.setValue("projectId", projectId);
      form.setValue("projectName", project.name);
      setStoredProject({ id: projectId, name: project.name });
      fetchScorers(projectId);
      fetchDatasets(projectId);
      setSelectedScorers([]);
      setSelectedDatasetId(null);
      clearProfiles();
    }
  };

  const togglePresetPersona = useCallback((persona: Persona) => {
    setSelectedPersonas(prev => {
      const exists = prev.some((p) => p.id === persona.id);
      if (exists) {
        return prev.filter((p) => p.id !== persona.id);
      } else {
        return [...prev, persona];
      }
    });
  }, []);

  const addCustomPersona = useCallback(() => {
    if (newPersona.name && newPersona.systemPrompt) {
      const customPersona: Persona = {
        id: `custom-${Date.now()}`,
        name: newPersona.name,
        description: newPersona.description || newPersona.name,
        systemPrompt: newPersona.systemPrompt,
        isPreset: false,
      };
      setSelectedPersonas(prev => [...prev, customPersona]);
      setNewPersona({ name: "", description: "", systemPrompt: "" });
      setCustomPersonaOpen(false);
    }
  }, [newPersona]);

  const removePersona = useCallback((personaId: string) => {
    setSelectedPersonas(prev => prev.filter((p) => p.id !== personaId));
  }, []);

  const addGoal = useCallback(() => {
    setGoals(prev => [...prev, {
      id: `goal-${Date.now()}`,
      description: "",
      successCriteria: "",
    }]);
  }, []);

  const removeGoal = useCallback((index: number) => {
    setGoals(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateGoal = useCallback((index: number, field: "description" | "successCriteria", value: string) => {
    setGoals(prev => prev.map((g, i) => i === index ? { ...g, [field]: value } : g));
  }, []);

  const toggleScorer = useCallback((scorer: Scorer) => {
    setSelectedScorers(prev => {
      const exists = prev.some((s) => s.scorerId === scorer.id);
      if (exists) {
        return prev.filter((s) => s.scorerId !== scorer.id);
      } else {
        return [...prev, {
          scorerId: scorer.id,
          name: scorer.name,
          type: scorer.type,
        }];
      }
    });
  }, []);

  const addChoiceScore = useCallback(() => {
    if (newCustomScorer.choiceInput && newCustomScorer.scoreInput !== "") {
      const score = parseFloat(newCustomScorer.scoreInput);
      if (!isNaN(score) && score >= 0 && score <= 1) {
        setNewCustomScorer(prev => ({
          ...prev,
          choiceScores: {
            ...prev.choiceScores,
            [prev.choiceInput]: score,
          },
          choiceInput: "",
          scoreInput: "",
        }));
      }
    }
  }, [newCustomScorer.choiceInput, newCustomScorer.scoreInput]);

  const removeChoiceScore = useCallback((choice: string) => {
    setNewCustomScorer(prev => {
      const newChoices = { ...prev.choiceScores };
      delete newChoices[choice];
      return { ...prev, choiceScores: newChoices };
    });
  }, []);

  const addCustomScorer = useCallback(() => {
    if (
      newCustomScorer.name &&
      newCustomScorer.promptTemplate &&
      Object.keys(newCustomScorer.choiceScores).length >= 2
    ) {
      const customScorer: ScorerConfig = {
        scorerId: `custom-${Date.now()}`,
        name: newCustomScorer.name,
        type: "llm-judge",
        promptTemplate: newCustomScorer.promptTemplate,
        choiceScores: newCustomScorer.choiceScores,
        useCoT: newCustomScorer.useCoT,
      };
      setSelectedScorers(prev => [...prev, customScorer]);
      setNewCustomScorer({
        name: "",
        description: "",
        promptTemplate: "",
        choiceScores: {},
        choiceInput: "",
        scoreInput: "",
        useCoT: true,
      });
      setCustomScorerOpen(false);
    }
  }, [newCustomScorer]);

  const onSubmit = async (data: SimulationConfigFormValues) => {
    // Inject resolved org name if the form value is empty
    if (data.target.type === "remote-eval" && !data.target.orgName && resolvedOrgName) {
      data.target.orgName = resolvedOrgName;
    }
    await runSimulation(data);
  };

  const completedRuns = progress.filter((p) => p.type === "completed").length;
  const totalRuns =
    profileSource === "dataset" && extractedProfiles.length > 0
      ? extractedProfiles.length
      : selectedPersonas.length * goals.length || 0;
  const progressPercent = totalRuns > 0 ? (completedRuns / totalRuns) * 100 : 0;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* API Key & Project */}
        <Card>
          <CardHeader>
            <CardTitle>Braintrust Connection</CardTitle>
            <CardDescription>
              Connect to your Braintrust account to log simulation results
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">Braintrust API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
              />
              {apiKeyValid && (
                <p className="text-sm text-green-600">API key validated</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={form.watch("projectId")}
                onValueChange={handleProjectChange}
                disabled={!apiKeyValid || projectsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={projectsLoading ? "Loading..." : "Select a project"} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projectsError && (
                <p className="text-sm text-red-600">{projectsError}</p>
              )}
            </div>

            <FormField
              control={form.control}
              name="experimentName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Experiment Name (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="my-simulation-experiment"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Leave blank to auto-generate
                  </FormDescription>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Target Agent */}
        <Card>
          <CardHeader>
            <CardTitle>Target Agent</CardTitle>
            <CardDescription>
              Configure the agent you want to test
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs
              value={form.watch("target.type") ?? "api"}
              onValueChange={(value) => {
                if (value === "api") {
                  form.setValue("target", { type: "api", endpoint: "" }, { shouldValidate: false });
                } else {
                  const serverUrl = "http://localhost:8300";
                  form.setValue("target", { type: "remote-eval", serverUrl, evalName: "", orgName: resolvedOrgName ?? "" }, { shouldValidate: false });
                  fetchEvalNames(serverUrl);
                }
                form.clearErrors("target");
              }}
            >
              <TabsList>
                <TabsTrigger value="api">API endpoint</TabsTrigger>
                <TabsTrigger value="remote-eval">Remote eval</TabsTrigger>
              </TabsList>
              <TabsContent value="api">
                <FormField
                  control={form.control}
                  name="target.endpoint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API endpoint</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://your-agent.com/chat"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Your agent&apos;s chat endpoint. Should accept POST with {`{messages: [{role, content}]}`}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
              <TabsContent value="remote-eval" className="space-y-4">
                <FormField
                  control={form.control}
                  name="target.serverUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dev server URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="http://localhost:8300"
                          {...field}
                          value={field.value ?? "http://localhost:8300"}
                        />
                      </FormControl>
                      <FormDescription>
                        Braintrust dev server started with{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">npx braintrust eval --dev</code>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="target.evalName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Eval name</FormLabel>
                      <div className="flex gap-2">
                        {evalNames.length > 0 ? (
                          <Select
                            value={field.value ?? ""}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select an eval" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {evalNames.map((name) => (
                                <SelectItem key={name} value={name}>
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <FormControl>
                            <Input
                              placeholder="e.g., sim-eval"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={evalNamesLoading}
                          className="shrink-0"
                          onClick={() => {
                            const serverUrl = form.getValues("target.serverUrl") ?? "http://localhost:8300";
                            fetchEvalNames(serverUrl);
                          }}
                        >
                          {evalNamesLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Discover"
                          )}
                        </Button>
                      </div>
                      {evalNamesError && (
                        <p className="text-sm text-red-600">{evalNamesError}</p>
                      )}
                      <FormDescription>
                        Click Discover to find available evals on the dev server.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Simulation Profiles */}
        <Card>
          <CardHeader>
            <CardTitle>Simulation profiles</CardTitle>
            <CardDescription>
              Define personas and goals manually or extract them from a dataset
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs
              value={profileSource}
              onValueChange={(value) => setProfileSource(value as "manual" | "dataset")}
            >
              <TabsList>
                <TabsTrigger value="manual">Manual</TabsTrigger>
                <TabsTrigger value="dataset">
                  <Database className="mr-2 h-4 w-4" />
                  From dataset
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="space-y-6">
                {/* Personas section */}
                <div className="space-y-4">
                  <Label className="text-base font-medium">Personas</Label>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                    {PRESET_PERSONAS.map((persona) => {
                      const isSelected = selectedPersonas.some((p) => p.id === persona.id);
                      return (
                        <div
                          key={persona.id}
                          role="button"
                          tabIndex={0}
                          className={`flex cursor-pointer items-center space-x-2 rounded-lg border p-3 transition-colors ${
                            isSelected ? "border-primary bg-primary/5" : "hover:bg-muted"
                          }`}
                          onClick={() => togglePresetPersona(persona)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              togglePresetPersona(persona);
                            }
                          }}
                        >
                          <div className={`h-4 w-4 rounded border ${isSelected ? "bg-primary border-primary" : "border-input"} flex items-center justify-center`}>
                            {isSelected && <span className="text-primary-foreground text-xs">✓</span>}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{persona.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {persona.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {selectedPersonas.filter((p) => !p.isPreset).length > 0 && (
                    <div className="space-y-2">
                      <Label>Custom personas</Label>
                      {selectedPersonas
                        .filter((p) => !p.isPreset)
                        .map((persona) => (
                          <div
                            key={persona.id}
                            className="flex items-center justify-between rounded border p-2"
                          >
                            <span className="text-sm">{persona.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removePersona(persona.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                    </div>
                  )}

                  <Dialog open={customPersonaOpen} onOpenChange={setCustomPersonaOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Add custom persona
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create custom persona</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            value={newPersona.name}
                            onChange={(e) =>
                              setNewPersona({ ...newPersona, name: e.target.value })
                            }
                            placeholder="e.g., Technical Expert"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input
                            value={newPersona.description}
                            onChange={(e) =>
                              setNewPersona({ ...newPersona, description: e.target.value })
                            }
                            placeholder="Brief description of this persona"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>System prompt</Label>
                          <Textarea
                            value={newPersona.systemPrompt}
                            onChange={(e) =>
                              setNewPersona({ ...newPersona, systemPrompt: e.target.value })
                            }
                            placeholder="Describe the persona's behavior, communication style, and characteristics..."
                            rows={5}
                          />
                        </div>
                        <Button type="button" onClick={addCustomPersona}>
                          Add persona
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Goals section */}
                <div className="space-y-4">
                  <Label className="text-base font-medium">Goals</Label>
                  {goals.map((goal, index) => (
                    <div key={goal.id} className="space-y-3 rounded-lg border p-4">
                      <div className="flex items-start justify-between">
                        <span className="text-sm font-medium">Goal {index + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeGoal(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input
                          placeholder="e.g., Get a refund for a recent order"
                          value={goal.description}
                          onChange={(e) => updateGoal(index, "description", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Success criteria</Label>
                        <Textarea
                          placeholder="How do we know if this goal was achieved?"
                          rows={2}
                          value={goal.successCriteria}
                          onChange={(e) => updateGoal(index, "successCriteria", e.target.value)}
                        />
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" onClick={addGoal}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add goal
                  </Button>
                </div>

                {selectedPersonas.length > 0 && goals.length > 0 && (
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-sm font-medium">
                      {selectedPersonas.length} personas x {goals.length} goals ={" "}
                      <span className="text-primary">{selectedPersonas.length * goals.length} simulations</span>
                    </p>
                  </div>
                )}

                {form.formState.errors.personas && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.personas.message}
                  </p>
                )}
              </TabsContent>

              <TabsContent value="dataset" className="space-y-4">
                <div className="space-y-2">
                  <Label>Dataset</Label>
                  <Select
                    value={selectedDatasetId ?? ""}
                    onValueChange={(value) => {
                      setSelectedDatasetId(value);
                      clearProfiles();
                    }}
                    disabled={datasetsLoading || datasets.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          datasetsLoading
                            ? "Loading datasets..."
                            : datasets.length === 0
                              ? "No datasets in this project"
                              : "Select a dataset"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>
                          {dataset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedDatasetId || extracting}
                  onClick={() => {
                    if (selectedDatasetId) {
                      extractFromDataset(selectedDatasetId);
                    }
                  }}
                >
                  {extracting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Extracting profiles...
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      Extract profiles
                    </>
                  )}
                </Button>

                {extractionError && (
                  <p className="text-sm text-red-600">{extractionError}</p>
                )}

                {extractedProfiles.length > 0 && (
                  <div className="space-y-3">
                    {extractedProfiles.map((profile) => (
                      <ExtractedProfileCard
                        key={profile.id}
                        profile={profile}
                        onRemove={removeExtractedProfile}
                        onUpdate={updateExtractedProfile}
                      />
                    ))}
                    <div className="rounded-lg bg-muted p-3">
                      <p className="text-sm font-medium">
                        <span className="text-primary">{extractedProfiles.length} paired simulations</span>
                      </p>
                    </div>
                  </div>
                )}

                {!form.watch("projectId") && (
                  <p className="text-sm text-muted-foreground">
                    Select a project first to see available datasets
                  </p>
                )}

                {form.formState.errors.personas && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.personas.message}
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Scorers */}
        <Card>
          <CardHeader>
            <CardTitle>Scorers</CardTitle>
            <CardDescription>
              {form.watch("target.type") === "remote-eval"
                ? "Scorers are defined in your eval file"
                : "Select scorers to evaluate conversation quality (optional)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.watch("target.type") === "remote-eval" ? (() => {
              const selectedEvalName = form.watch("target.evalName") ?? "";
              const matchedKey = Object.keys(evalScorers).find(
                (k) => k === selectedEvalName || k.startsWith(selectedEvalName)
              );
              const scorerNames = matchedKey ? evalScorers[matchedKey] : [];
              return (
                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-medium">Scorers from eval file</p>
                    {scorerNames.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {scorerNames.map((name) => (
                          <code key={name} className="rounded bg-blue-100 px-2 py-0.5 text-xs dark:bg-blue-900">{name}</code>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-blue-600 dark:text-blue-300">
                        Click Discover in the target section to detect scorers from your eval file.
                      </p>
                    )}
                  </div>
                </div>
              );
            })() : !form.watch("projectId") ? (
              <p className="text-sm text-muted-foreground">
                Select a project to see available scorers
              </p>
            ) : scorersLoading ? (
              <p className="text-sm text-muted-foreground">Loading scorers...</p>
            ) : scorers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No online scorers configured for this project. You can add scorers in your Braintrust project settings.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {scorers.map((scorer) => {
                  const isSelected = selectedScorers.some((s) => s.scorerId === scorer.id);
                  return (
                    <div
                      key={scorer.id}
                      role="button"
                      tabIndex={0}
                      className={`flex cursor-pointer items-start space-x-3 rounded-lg border p-3 transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "hover:bg-muted"
                      }`}
                      onClick={() => toggleScorer(scorer)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleScorer(scorer);
                        }
                      }}
                    >
                      <div className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${isSelected ? "bg-primary border-primary" : "border-input"} flex items-center justify-center`}>
                        {isSelected && <span className="text-primary-foreground text-xs">✓</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{scorer.name}</p>
                        {scorer.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {scorer.description}
                          </p>
                        )}
                        <Badge variant="outline" className="mt-1 text-xs">
                          {scorer.type}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {form.watch("target.type") !== "remote-eval" && (
              <>
                {/* Custom LLM Judge Scorers */}
                {selectedScorers.filter((s) => s.type === "llm-judge").length > 0 && (
                  <div className="space-y-2">
                    <Label>Custom LLM Judge Scorers</Label>
                    {selectedScorers
                      .filter((s) => s.type === "llm-judge")
                      .map((scorer) => (
                        <div
                          key={scorer.scorerId}
                          className="flex items-center justify-between rounded border p-2"
                        >
                          <div>
                            <span className="text-sm font-medium">{scorer.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({Object.keys(scorer.choiceScores || {}).length} choices)
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedScorers(prev => prev.filter(s => s.scorerId !== scorer.scorerId))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                  </div>
                )}

                <Dialog open={customScorerOpen} onOpenChange={setCustomScorerOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Custom LLM Judge
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create Custom LLM Judge Scorer</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={newCustomScorer.name}
                          onChange={(e) =>
                            setNewCustomScorer({ ...newCustomScorer, name: e.target.value })
                          }
                          placeholder="e.g., Politeness Check"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Prompt Template</Label>
                        <Textarea
                          value={newCustomScorer.promptTemplate}
                          onChange={(e) =>
                            setNewCustomScorer({ ...newCustomScorer, promptTemplate: e.target.value })
                          }
                          placeholder={`Evaluate the assistant's response for politeness.

Conversation:
{{conversation}}

User's goal: {{goal}}

Was the assistant polite and professional?`}
                          rows={8}
                        />
                        <p className="text-xs text-muted-foreground">
                          Available variables: {"{{conversation}}"}, {"{{output}}"}, {"{{input}}"}, {"{{goal}}"}, {"{{goal_criteria}}"}, {"{{persona}}"}, {"{{persona_description}}"}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Choice Scores</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          Define choices and their corresponding scores (0-1). The LLM will select one choice.
                        </p>

                        {Object.entries(newCustomScorer.choiceScores).map(([choice, score]) => (
                          <div key={choice} className="flex items-center gap-2">
                            <span className="text-sm flex-1">{choice}</span>
                            <span className="text-sm text-muted-foreground">Score: {score}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeChoiceScore(choice)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}

                        <div className="flex gap-2">
                          <Input
                            value={newCustomScorer.choiceInput}
                            onChange={(e) =>
                              setNewCustomScorer({ ...newCustomScorer, choiceInput: e.target.value })
                            }
                            placeholder="Choice label (e.g., Very Polite)"
                            className="flex-1"
                          />
                          <Input
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                            value={newCustomScorer.scoreInput}
                            onChange={(e) =>
                              setNewCustomScorer({ ...newCustomScorer, scoreInput: e.target.value })
                            }
                            placeholder="Score"
                            className="w-24"
                          />
                          <Button type="button" variant="outline" size="sm" onClick={addChoiceScore}>
                            Add
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <Label>Chain of Thought</Label>
                          <p className="text-xs text-muted-foreground">
                            Require the LLM to explain its reasoning before selecting a choice
                          </p>
                        </div>
                        <Switch
                          checked={newCustomScorer.useCoT}
                          onCheckedChange={(checked) =>
                            setNewCustomScorer({ ...newCustomScorer, useCoT: checked })
                          }
                        />
                      </div>

                      <Button
                        type="button"
                        onClick={addCustomScorer}
                        disabled={
                          !newCustomScorer.name ||
                          !newCustomScorer.promptTemplate ||
                          Object.keys(newCustomScorer.choiceScores).length < 2
                        }
                      >
                        Add Scorer
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {selectedScorers.length > 0 && (
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-sm font-medium">
                      {selectedScorers.length} scorer{selectedScorers.length !== 1 ? "s" : ""} selected
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Simulation Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="settings.maxTurns"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Max Turns</FormLabel>
                    <span className="text-sm text-muted-foreground">
                      {field.value}
                    </span>
                  </div>
                  <FormControl>
                    <Slider
                      min={1}
                      max={30}
                      step={1}
                      value={[field.value]}
                      onValueChange={([value]) => field.onChange(value)}
                    />
                  </FormControl>
                  <FormDescription>
                    Maximum conversation turns per simulation
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="settings.simulatorModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Simulator Model</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MODELS.map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    LLM used to simulate user messages
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="settings.temperature"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Temperature</FormLabel>
                    <span className="text-sm text-muted-foreground">
                      {field.value.toFixed(1)}
                    </span>
                  </div>
                  <FormControl>
                    <Slider
                      min={0}
                      max={1.5}
                      step={0.1}
                      value={[field.value]}
                      onValueChange={([value]) => field.onChange(value)}
                    />
                  </FormControl>
                  <FormDescription>
                    Higher = more varied responses
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="settings.stopOnGoalAchieved"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Stop on goal achieved</FormLabel>
                    <FormDescription>
                      End conversation early when goal is detected as achieved
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Progress & Results */}
        {status !== "idle" && (
          <Card>
            <CardHeader>
              <CardTitle>Simulation Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {completedRuns} / {totalRuns} simulations completed
                  </span>
                  <span>{Math.round(progressPercent)}%</span>
                </div>
                <Progress value={progressPercent} />
              </div>

              {/* Latest progress events */}
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {progress.slice(-5).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant={p.type === "completed" ? "default" : "secondary"}>
                      {p.type}
                    </Badge>
                    <span className="truncate">
                      {p.persona} - {p.goal}
                      {p.turn && ` (turn ${p.turn})`}
                    </span>
                  </div>
                ))}
              </div>

              {status === "completed" && (
                experimentUrl ? (
                  <a
                    href={experimentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View results in Braintrust
                  </a>
                ) : mode === "remote-eval" ? (
                  <p className="text-sm text-muted-foreground">
                    Check your Braintrust project for experiment results
                  </p>
                ) : null
              )}

              {simError && (
                <p className="text-sm text-red-600">{simError}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="submit"
            size="lg"
            disabled={status === "running" || !apiKeyValid}
            className="flex-1"
          >
            {status === "running" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Simulation...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Simulation
              </>
            )}
          </Button>
          {status === "completed" && (
            <Button type="button" variant="outline" onClick={reset}>
              Reset
            </Button>
          )}
        </div>

      </form>
    </Form>
  );
}
